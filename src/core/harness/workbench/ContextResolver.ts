import { db } from "@/utils/db";
import { entityId, numericEntityId, type EntityKind } from "../domain/ids";
import { artifactGraph, type ArtifactGraph } from "./ArtifactGraph";
import type {
  ActionRunSummary,
  ContextEntityRef,
  ContextSourceTrace,
  ProjectContext,
  WorkbenchContextInput,
} from "./contracts";

const DEFAULT_TOKEN_BUDGET = 12_000;
const TOKEN_CHARS = 3;

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? null).length / TOKEN_CHARS);
}

function toRef(input: { type: string; id: string | number; label?: string }): ContextEntityRef {
  return {
    type: input.type as ContextEntityRef["type"],
    id: entityId(input.type as EntityKind, input.id),
    label: input.label,
  } as ContextEntityRef;
}

export class ContextResolver {
  constructor(private readonly graph: ArtifactGraph = artifactGraph) {}

  extractPageContext(input: WorkbenchContextInput): Pick<ProjectContext, "route" | "selected" | "visible"> {
    return {
      route: {
        route: input.route,
        domain: input.domain,
        projectId: entityId("project", input.projectId),
        episodeId: input.episodeId === undefined ? undefined : entityId("episode", input.episodeId),
      },
      selected: (input.selected || []).map(toRef),
      visible: (input.visible || []).map(toRef),
    };
  }

  async resolve(input: WorkbenchContextInput): Promise<ProjectContext> {
    const page = this.extractPageContext(input);
    const projectId = numericEntityId(page.route.projectId, "project");
    const maxTokens = Math.max(1_000, input.maxTokens || DEFAULT_TOKEN_BUDGET);
    const loadedAt = Date.now();
    const trace: ContextSourceTrace[] = [];
    let usedTokens = 0;
    const omittedSourceIds: string[] = [];

    const include = <T>(sourceId: string, sourceType: ContextSourceTrace["sourceType"], value: T): T | undefined => {
      const tokens = estimateTokens(value);
      const included = usedTokens + tokens <= maxTokens;
      trace.push({ sourceId, sourceType, loadedAt, included, estimatedTokens: tokens, reason: included ? undefined : "token_budget_exceeded" });
      if (included) usedTokens += tokens;
      else omittedSourceIds.push(sourceId);
      return included ? value : undefined;
    };

    include(`route:${input.route}`, "route", page.route);
    include("selection", "selection", page.selected);
    include("visible", "visible", page.visible);

    const projectRow = await db("o_project").where("id", projectId).first();
    const project = include(`project:${projectId}`, "database", projectRow || null);

    let episode: Record<string, unknown> | undefined;
    if (page.route.episodeId) {
      const episodeId = numericEntityId(page.route.episodeId, "episode");
      const row = await db("o_script").where({ id: episodeId, projectId }).first();
      episode = include(`episode:${episodeId}`, "database", row || null) as Record<string, unknown> | undefined;
    }

    const selectedWithRelations = await this.loadSelectedDetails(projectId, page.selected);
    const selected = include("selection:details", "database", selectedWithRelations) || page.selected;
    const graph = await this.graph.resolve(projectId, [...selected, ...page.visible]);
    include("artifact-links", "artifact-link", graph);

    const pendingReviews = await this.loadPendingReviews(projectId);
    const recentActionRuns = await this.loadRecentActionRuns(projectId);
    const productionState = await this.loadProductionState(projectId);

    return {
      route: page.route,
      project: project as Record<string, unknown> | undefined,
      episode,
      selected,
      visible: page.visible,
      related: graph.related,
      upstreamArtifacts: graph.upstream,
      downstreamArtifacts: graph.downstream,
      pendingReviews: include("pending-reviews", "database", pendingReviews) || [],
      recentActionRuns: include("recent-action-runs", "action-run", recentActionRuns) || [],
      productionState: include("production-state", "database", productionState) || productionState,
      trace,
      budget: { maxTokens, estimatedTokens: usedTokens, omittedSourceIds },
      resolvedAt: Date.now(),
    };
  }

  private async loadSelectedDetails(projectId: number, refs: ContextEntityRef[]): Promise<ContextEntityRef[]> {
    const result: ContextEntityRef[] = [];
    for (const ref of refs) {
      if (ref.type !== "shot") {
        result.push(ref);
        continue;
      }
      const shotId = numericEntityId(ref.id as any, "shot");
      const row = await db("o_storyboard").where({ id: shotId, projectId }).first();
      result.push({ ...ref, label: ref.label || row?.videoDesc || `镜头 ${row?.index ?? shotId}`, version: row ? await this.latestVersion(projectId, "shot", shotId) : undefined });
      if (!row) continue;
      if (row.scriptId) result.push({ type: "script", id: entityId("script", row.scriptId), label: "来源剧本" } as ContextEntityRef);
      const assets = await db("o_assets2Storyboard")
        .join("o_assets", "o_assets.id", "o_assets2Storyboard.assetId")
        .where("o_assets2Storyboard.storyboardId", shotId)
        .select("o_assets.id", "o_assets.name", "o_assets.type");
      for (const asset of assets) {
        const kind = asset.type === "role" ? "character" : asset.type === "tool" ? "prop" : "location";
        result.push({ type: kind, id: entityId(kind, asset.id), label: asset.name } as ContextEntityRef);
      }
    }
    return this.uniqueRefs(result);
  }

  private async latestVersion(projectId: number, artifactType: string, id: number): Promise<number | undefined> {
    if (!(await db.schema.hasTable("o_artifact_version"))) return undefined;
    const row = await db("o_artifact_version").where({ projectId, artifactType, artifactKey: `${artifactType}:${id}` }).max("version as version").first();
    return row?.version || undefined;
  }

  private async loadPendingReviews(projectId: number): Promise<Array<Record<string, unknown>>> {
    if (!(await db.schema.hasTable("o_review_report"))) return [];
    const instanceColumn = await db.schema.hasColumn("o_review_report", "instanceId") ? "instanceId" : "workflowInstanceId";
    const timeColumn = await db.schema.hasColumn("o_review_report", "createdAt") ? "createdAt" : "createTime";
    let query = db("o_review_report")
      .join("o_workflow_state", "o_workflow_state.id", `o_review_report.${instanceColumn}`)
      .where("o_workflow_state.projectId", projectId);
    if (await db.schema.hasColumn("o_review_report", "passed")) {
      query = query.where("o_review_report.passed", 0);
    } else if (await db.schema.hasColumn("o_review_report", "decision")) {
      query = query.whereNotIn("o_review_report.decision", ["pass", "approved", "approve"]);
    }
    return query.orderBy(`o_review_report.${timeColumn}`, "desc").limit(20).select("o_review_report.*");
  }

  private async loadRecentActionRuns(projectId: number): Promise<ActionRunSummary[]> {
    if (!(await db.schema.hasTable("o_action_run"))) return [];
    const rows = await db("o_action_run").where("projectId", projectId).orderBy("updatedAt", "desc").limit(10);
    return rows.map((row: any) => {
      const result = this.parseJson<any>(row.result, {});
      return {
      id: row.id,
      userInstruction: row.userInstruction,
      status: row.status,
      toolNames: this.parseJson(row.toolCalls, []).map((call: any) => call.toolName),
      stage: result.stage,
      updatedAt: row.updatedAt,
      };
    });
  }

  private async loadProductionState(projectId: number) {
    const workRow = await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
    const workData = this.parseJson<any>(workRow?.data, {});
    const hasNovel = Number((await db("o_novel").where({ projectId }).count({ count: "*" }).first())?.count || 0) > 0;
    const scriptCount = Number((await db("o_script").where({ projectId }).count({ count: "*" }).first())?.count || 0);
    const assetCount = await db.schema.hasTable("o_assets") ? Number((await db("o_assets").where({ projectId }).count({ count: "*" }).first())?.count || 0) : 0;
    const productionRows = await db("o_agentWorkData").where({ projectId, key: "productionAgent" });
    const hasDirectorPlan = productionRows.some((row: any) => Boolean(this.parseJson<any>(row.data, {}).directorPlan?.trim?.()));
    const shotCount = await db.schema.hasTable("o_storyboard") ? Number((await db("o_storyboard").where({ projectId }).count({ count: "*" }).first())?.count || 0) : 0;
    const videoCount = await db.schema.hasTable("o_video") ? Number((await db("o_video").where({ projectId }).count({ count: "*" }).first())?.count || 0) : 0;
    const hasStorySkeleton = Boolean(workData.storySkeleton?.trim?.());
    const hasAdaptationStrategy = Boolean(workData.adaptationStrategy?.trim?.());
    const nextStage = !hasStorySkeleton || !hasAdaptationStrategy ? "development"
      : !scriptCount ? "screenplay"
        : !assetCount ? "assets"
          : !hasDirectorPlan ? "director_plan"
            : !shotCount ? "storyboard"
              : videoCount < shotCount ? "video" : "complete";
    return { hasNovel, hasStorySkeleton, hasAdaptationStrategy, scriptCount, assetCount, hasDirectorPlan, shotCount, videoCount, nextStage } as const;
  }

  private parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }

  private uniqueRefs(refs: ContextEntityRef[]): ContextEntityRef[] {
    return [...new Map(refs.map(ref => [String(ref.id), ref])).values()];
  }
}

export const contextResolver = new ContextResolver();

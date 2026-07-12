import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/utils/db";
import getPath from "@/utils/getPath";
import type { AgentRegistry } from "../AgentRegistry";
import type { SkillsRegistry } from "../SkillsRegistry";

export type DirectorStage = "skeleton" | "adaptation" | "screenplay" | "assets" | "director_plan" | "storyboard" | "video";

export interface DirectorCapability {
  stage: DirectorStage;
  agentKey: string;
  agentName: string;
  harnessRole: string;
  skillFile: string;
  skillId: string;
  skillName: string;
  modelName: string;
  enabled: boolean;
  source: "toonflow" | "harness";
}

const STAGES: Record<DirectorStage, Omit<DirectorCapability, "skillId" | "skillName" | "modelName" | "enabled">> = {
  skeleton: { stage: "skeleton", agentKey: "scriptAgent:storySkeletonAgent", agentName: "剧本 Agent:故事骨架", harnessRole: "screenwriter", skillFile: "script_execution_skeleton.md", source: "toonflow" },
  adaptation: { stage: "adaptation", agentKey: "scriptAgent:adaptationStrategyAgent", agentName: "剧本 Agent:改编策略", harnessRole: "screenwriter", skillFile: "script_execution_adaptation.md", source: "toonflow" },
  screenplay: { stage: "screenplay", agentKey: "scriptAgent:scriptAgent", agentName: "剧本 Agent:剧本生成", harnessRole: "screenwriter", skillFile: "script_execution_script.md", source: "toonflow" },
  assets: { stage: "assets", agentKey: "productionAgent:deriveAssetsAgent", agentName: "美术设定 Agent", harnessRole: "set_decorator", skillFile: "production_execution_derive_assets.md", source: "toonflow" },
  director_plan: { stage: "director_plan", agentKey: "productionAgent:directorPlanAgent", agentName: "总调度导演 Agent", harnessRole: "director", skillFile: "production_execution_director_plan.md", source: "harness" },
  storyboard: { stage: "storyboard", agentKey: "productionAgent:storyboardPanelAgent", agentName: "分镜制作 Agent", harnessRole: "director", skillFile: "production_execution_storyboard_panel.md", source: "toonflow" },
  video: { stage: "video", agentKey: "dp", agentName: "视频生成 Agent", harnessRole: "dp", skillFile: "production_execution_storyboard_gen.md", source: "harness" },
};

export class DirectorCapabilityCatalog {
  private agentRegistry?: AgentRegistry;
  private skillsRegistry?: SkillsRegistry;

  bind(agentRegistry: AgentRegistry, skillsRegistry: SkillsRegistry): void {
    this.agentRegistry = agentRegistry;
    this.skillsRegistry = skillsRegistry;
  }

  async resolve(stage: DirectorStage): Promise<DirectorCapability & { skillContent: string }> {
    const base = STAGES[stage];
    const deployment = await this.resolveDeployment(base.agentKey, base.harnessRole);
    const registeredSkill = this.skillsRegistry?.getBySourceName(base.skillFile);
    const sourcePath = registeredSkill?.sourcePath || path.join(getPath("skills"), base.skillFile);
    const skillContent = await fs.readFile(sourcePath, "utf-8");
    if (!deployment?.modelName) {
      throw new Error(`${base.agentName} 未配置模型，请在 Toonflow 设置 > Agent配置 中完成配置`);
    }
    if (deployment.disabled) {
      throw new Error(`${base.agentName} 已在 Agent配置 中禁用`);
    }
    return {
      ...base,
      agentKey: deployment.key || base.agentKey,
      agentName: deployment.name || base.agentName,
      skillId: registeredSkill?.id || base.skillFile.replace(/\.md$/i, ""),
      skillName: registeredSkill?.name || base.skillFile,
      modelName: deployment.modelName,
      enabled: true,
      skillContent,
    };
  }

  async list(): Promise<Array<DirectorCapability & { capabilities: string[] }>> {
    const results: any[] = [];
    for (const stage of Object.keys(STAGES) as DirectorStage[]) {
      try {
        const { skillContent: _content, ...capability } = await this.resolve(stage);
        const harnessAgent = this.agentRegistry?.findByRole(capability.harnessRole as any);
        results.push({ ...capability, capabilities: harnessAgent?.capabilities || [] });
      } catch (error) {
        const base = STAGES[stage];
        results.push({ ...base, skillId: base.skillFile.replace(/\.md$/i, ""), skillName: base.skillFile, modelName: "", enabled: false, capabilities: [], error: error instanceof Error ? error.message : String(error) } as any);
      }
    }
    const representedRoles = new Set(results.map(item => item.harnessRole));
    for (const agent of this.agentRegistry?.listAll() || []) {
      if (representedRoles.has(agent.role)) continue;
      const deployment = await this.resolveDeployment(agent.id, agent.role);
      results.push({
        stage: `support:${agent.role}`,
        agentKey: deployment?.key || agent.id,
        agentName: agent.name,
        harnessRole: agent.role,
        skillFile: "",
        skillId: `harness-agent-${agent.id}`,
        skillName: "Harness Agent system prompt",
        modelName: deployment?.modelName || "",
        enabled: Boolean(deployment?.modelName) && !deployment?.disabled,
        source: "harness",
        capabilities: agent.capabilities,
      });
    }
    return results;
  }

  private async resolveDeployment(agentKey: string, harnessRole: string): Promise<any> {
    const mode = await db("o_setting").where("key", "agentUseMode").first();
    const candidates = mode?.value === "0"
      ? [agentKey.split(":")[0], agentKey, harnessRole, "universalAi"]
      : [agentKey, harnessRole, agentKey.split(":")[0], "universalAi"];
    for (const key of [...new Set(candidates)]) {
      const row = await db("o_agentDeploy").where({ key }).first();
      if (row?.modelName) return row;
    }
    return undefined;
  }
}

export const directorCapabilityCatalog = new DirectorCapabilityCatalog();

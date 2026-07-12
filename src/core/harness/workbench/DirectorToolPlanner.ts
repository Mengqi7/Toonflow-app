import Ai from "@/utils/ai";
import { ToolRegistry } from "../tools/ToolRegistry";
import type { ActionPlan, ContextEntityRef, ProjectContext } from "./contracts";

export interface PlannedToolInstruction {
  plan: ActionPlan;
  toolName: string;
  input: Record<string, unknown>;
}

export class DirectorToolPlanner {
  constructor(private readonly registry: ToolRegistry) {}

  async plan(message: string, context: ProjectContext): Promise<PlannedToolInstruction> {
    const deterministic = this.planDeterministic(message, context);
    if (deterministic) return deterministic;
    return this.planWithModel(message, context);
  }

  private planDeterministic(message: string, context: ProjectContext): PlannedToolInstruction | undefined {
    const selected = context.selected[0];
    const shot = context.selected.find(ref => ref.type === "shot");
    const shotSize = ["大远景", "远景", "全景", "中全景", "中景", "中近景", "近景", "特写", "大特写"].find(size => message.includes(size));
    if (shot && shotSize && /改|调整|设置|变成/.test(message)) {
      const preserve: string[] = [];
      if (/服装|造型|定妆/.test(message)) preserve.push("costume", "characterRefs");
      if (/场景|地点|环境/.test(message)) preserve.push("locationRef", "visualIdentity");
      return this.build("storyboard.update_shot", {
        shotId: shot.id,
        patch: { shotSize },
        preserve: [...new Set(preserve)],
        reason: message,
      }, `将 ${shot.label || shot.id} 的景别改为${shotSize}`, [shot]);
    }

    const createKind = /创建|新增|添加|生成/.test(message)
      ? (/人物|角色/.test(message) ? "character" : /道具/.test(message) ? "prop" : /地点|场景资产/.test(message) ? "location" : undefined)
      : undefined;
    if (createKind) {
      const name = this.extractName(message, createKind === "character" ? ["人物", "角色"] : createKind === "prop" ? ["道具"] : ["地点", "场景资产"]);
      if (name) return this.build(`${createKind}.create`, { name, description: message }, `创建${createKind === "character" ? "人物" : createKind === "prop" ? "道具" : "地点"}“${name}”`, []);
    }

    if (/创建|新增|添加/.test(message) && /场次|一场|场景/.test(message) && context.route.episodeId) {
      const title = this.extractQuoted(message) || message.replace(/请|帮我|创建|新增|添加|一个|一场|场次|场景/g, "").trim().slice(0, 40) || "新场次";
      return this.build("scene.create", { title, description: message }, `在当前剧集中创建场次“${title}”`, []);
    }

    if (selected && /查看|列出|历史|版本/.test(message) && /版本|历史/.test(message)) {
      return this.build("artifact.list_versions", { artifactType: selected.type, artifactId: selected.id }, `查询 ${selected.label || selected.id} 的版本历史`, [selected]);
    }

    const rollbackMatch = message.match(/(?:回滚|恢复).{0,8}(?:v|版本)?\s*(\d+)/i);
    if (selected && rollbackMatch && ["script", "beat", "scene", "shot", "character", "prop", "location"].includes(selected.type)) {
      return this.build("artifact.rollback", { artifactType: selected.type, artifactId: selected.id, version: Number(rollbackMatch[1]), reason: message }, `将 ${selected.label || selected.id} 回滚到版本 ${rollbackMatch[1]}`, [selected]);
    }
    return undefined;
  }

  private async planWithModel(message: string, context: ProjectContext): Promise<PlannedToolInstruction> {
    const tools = this.registry.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiresConfirmation: typeof tool.requiresConfirmation === "boolean" ? tool.requiresConfirmation : "dynamic",
    }));
    const prompt = `你是 Toonflow AI Director 的工具规划器。根据用户指令和当前页面上下文，只选择一个最合适的工具。

用户指令：${message}

当前上下文：
${JSON.stringify({
  route: context.route,
  selected: context.selected,
  visible: context.visible.slice(0, 30),
  related: context.related.slice(0, 30),
  upstreamArtifacts: context.upstreamArtifacts.slice(0, 20),
  downstreamArtifacts: context.downstreamArtifacts.slice(0, 20),
}, null, 2)}

可用工具：
${JSON.stringify(tools, null, 2)}

只返回 JSON：
{
  "toolName": "工具名",
  "input": {},
  "summary": "给用户看的执行摘要",
  "purpose": "本次工具调用目的",
  "targetIds": ["受影响的稳定ID"]
}

规则：
- 必须复用上下文中的稳定 ID，不得编造 ID。
- 用户没有提供且上下文也没有的必填信息，不得猜测。
- 不要选择任何 ComfyUI 专用能力。
- 只执行一个原子工具；复杂任务先选择第一个可执行步骤。`;
    const result = await Ai.Text("universalAi", false, 1).invoke({
      messages: [
        { role: "system", content: "你是结构化工具规划器，只输出合法 JSON。" },
        { role: "user", content: prompt },
      ],
    });
    const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI Director 未能生成可执行计划，请补充要操作的对象或字段");
    const parsed = JSON.parse(match[0]);
    if (!parsed.toolName || !this.registry.list().some(tool => tool.name === parsed.toolName)) throw new Error(`AI Director 选择了不可用工具：${parsed.toolName || "空"}`);
    const input = this.registry.validateInput<Record<string, unknown>>(parsed.toolName, parsed.input || {});
    return this.build(parsed.toolName, input, parsed.summary || `执行 ${parsed.toolName}`, this.resolveTargets(parsed.targetIds, context), parsed.purpose);
  }

  private build(toolName: string, input: Record<string, unknown>, summary: string, affectedObjects: ContextEntityRef[], purpose = summary): PlannedToolInstruction {
    const targetIds = affectedObjects.map(ref => String(ref.id));
    const requiresConfirmation = this.registry.needsConfirmation(toolName, input);
    return {
      toolName,
      input,
      plan: {
        summary,
        steps: [{ toolName, purpose, targetIds }],
        affectedObjects,
        requiresConfirmation,
        confirmationReason: requiresConfirmation ? "该操作会批量生成、跨阶段修改、回滚或完成终审" : undefined,
      },
    };
  }

  private resolveTargets(ids: unknown, context: ProjectContext): ContextEntityRef[] {
    if (!Array.isArray(ids)) return [];
    const all = [...context.selected, ...context.visible, ...context.related, ...context.upstreamArtifacts, ...context.downstreamArtifacts];
    return ids.map(String).map(id => all.find(ref => String(ref.id) === id)).filter((ref): ref is ContextEntityRef => Boolean(ref));
  }

  private extractQuoted(message: string): string | undefined {
    return message.match(/[“"']([^”"']+)[”"']/)?.[1]?.trim();
  }

  private extractName(message: string, markers: string[]): string | undefined {
    const quoted = this.extractQuoted(message);
    if (quoted) return quoted;
    for (const marker of markers) {
      const match = message.match(new RegExp(`${marker}[叫名为：:\\s]*([\\u4e00-\\u9fa5A-Za-z0-9_-]{2,20})`));
      if (match?.[1]) return match[1].replace(/并|，|。.*$/g, "");
    }
    return undefined;
  }
}

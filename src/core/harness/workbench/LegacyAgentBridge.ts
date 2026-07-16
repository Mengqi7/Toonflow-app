import Ai from "@/utils/ai";
import { directorCapabilityCatalog, type DirectorCapability, type DirectorStage } from "./DirectorCapabilityCatalog";

export interface DelegationEvidence {
  role: string;
  agentKey: string;
  agentName: string;
  skillId: string;
  skillName: string;
  modelName: string;
}

export interface ScreenplayDraft {
  name: string;
  content: string;
  delegation: DelegationEvidence;
}

export interface AssetDraft {
  characters: Array<{ name: string; description: string; prompt: string }>;
  props: Array<{ name: string; description: string; prompt: string }>;
  locations: Array<{ name: string; description: string; prompt: string }>;
  delegation: DelegationEvidence;
}

export interface StoryboardDraft {
  shots: Array<{
    prompt: string;
    videoDesc: string;
    duration?: number;
    shotSize?: string;
    cameraMovement?: string;
  }>;
  delegation: DelegationEvidence;
}

export interface TextStageDraft {
  content: string;
  delegation: DelegationEvidence;
}

/**
 * Runs the existing Script/Production Agent model profiles without coupling the
 * conversational workbench to their Socket.IO presentation protocol.
 */
export class LegacyAgentBridge {
  async writeStorySkeleton(input: { projectName: string; novel: string; instruction: string }): Promise<TextStageDraft> {
    return this.writeTextStage("skeleton", input, "storySkeleton");
  }

  async writeAdaptationStrategy(input: { projectName: string; novel: string; instruction: string; storySkeleton: string }): Promise<TextStageDraft> {
    return this.writeTextStage("adaptation", { ...input, context: `故事骨架：\n${input.storySkeleton}` }, "adaptationStrategy");
  }

  async createDirectorPlan(input: { script: string; assets: string[]; instruction: string }): Promise<TextStageDraft> {
    return this.writeTextStage("director_plan", {
      projectName: "Current production",
      novel: input.script,
      instruction: input.instruction,
      context: `可用资产：${input.assets.join("、") || "暂无"}`,
    }, "directorPlan");
  }

  async writeScreenplay(input: { projectName: string; novel: string; instruction: string; episodeName?: string }): Promise<ScreenplayDraft> {
    const capability = await directorCapabilityCatalog.resolve("screenplay");
    const text = await this.ask(capability, [
      "You are being invoked by the Harness Tool Runtime, not a browser chat.",
      "Return exactly one XML block: <scriptItem name=\"...\">full screenplay</scriptItem>.",
      `Project: ${input.projectName}`,
      `Episode target: ${input.episodeName || "new episode"}`,
      `Director instruction: ${input.instruction}`,
      "Novel source follows:",
      input.novel,
    ].join("\n\n"));
    const match = text.match(/<scriptItem\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/scriptItem>/i);
    if (!match?.[2]?.trim()) throw new Error("Script Agent returned no usable <scriptItem> output");
    return { name: match[1].trim(), content: match[2].trim(), delegation: this.evidence(capability) };
  }

  async deriveAssets(input: { script: string; instruction: string; existingAssets?: Pick<AssetDraft, "characters" | "props" | "locations"> }): Promise<AssetDraft> {
    const capability = await directorCapabilityCatalog.resolve("assets");
    const value = await this.askJson<AssetDraft>(capability, [
      "You are invoked by the Harness Tool Runtime. Do not call Socket.IO tools.",
      "Return JSON only with characters, props and locations arrays.",
      "Each item requires name, description and prompt. Keep each array to at most six items.",
      input.existingAssets
        ? `Update the existing asset set in place. Return the same names under the same characters, props and locations arrays; do not add, remove, move or rename items. Existing assets:\n${JSON.stringify(input.existingAssets, null, 2)}`
        : "Create the minimum complete set of characters, props and locations required by the screenplay.",
      `Director instruction: ${input.instruction}`,
      "Screenplay:",
      input.script,
    ].join("\n\n"));
    const normalised = this.normaliseAssets(value);
    const assets = input.existingAssets ? this.mergeExistingAssets(input.existingAssets, normalised) : normalised;
    return { ...assets, delegation: this.evidence(capability) };
  }

  async planStoryboard(input: { script: string; assets: string[]; instruction: string }): Promise<StoryboardDraft> {
    const capability = await directorCapabilityCatalog.resolve("storyboard");
    const value = await this.askJson<StoryboardDraft>(capability, [
      "You are invoked by the Harness Tool Runtime. Do not call Socket.IO tools.",
      "Return JSON only: {\"shots\":[{\"prompt\":string,\"videoDesc\":string,\"duration\":number,\"shotSize\":string,\"cameraMovement\":string}]}",
      "Return 3 to 6 shots in narrative order. Reference only the supplied asset names.",
      `Available assets: ${input.assets.join(", ") || "none"}`,
      `Director instruction: ${input.instruction}`,
      "Screenplay:",
      input.script,
    ].join("\n\n"));
    const shots = Array.isArray(value.shots) ? value.shots : [];
    if (!shots.length) throw new Error("Storyboard Agent returned no shots");
    return {
      shots: shots.slice(0, 12).map(shot => ({
        prompt: this.requireText(shot?.prompt, "storyboard prompt"),
        videoDesc: this.requireText(shot?.videoDesc, "storyboard video description"),
        duration: this.numberOr(shot?.duration, 5),
        shotSize: this.optionalText(shot?.shotSize),
        cameraMovement: this.optionalText(shot?.cameraMovement),
      })),
      delegation: this.evidence(capability),
    };
  }

  private async writeTextStage(stage: Extract<DirectorStage, "skeleton" | "adaptation" | "director_plan">, input: { projectName: string; novel: string; instruction: string; context?: string }, tag: string): Promise<TextStageDraft> {
    const capability = await directorCapabilityCatalog.resolve(stage);
    const text = await this.ask(capability, [
      "You are invoked by the Harness Tool Runtime. Do not call browser or Socket.IO tools.",
      `Return the complete result inside exactly one <${tag}>...</${tag}> XML block.`,
      `Project: ${input.projectName}`,
      `Director instruction: ${input.instruction}`,
      input.context || "",
      "Source material:",
      input.novel,
    ].filter(Boolean).join("\n\n"));
    const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    const content = (match?.[1] || text).trim();
    if (!content) throw new Error(`${capability.agentName} returned no usable ${tag} output`);
    return { content, delegation: this.evidence(capability) };
  }

  private async ask(capability: DirectorCapability & { skillContent: string }, prompt: string): Promise<string> {
    const result = await Ai.Text(capability.agentKey as any, false, 1).invoke({
      messages: [
        { role: "system", content: capability.skillContent },
        { role: "user", content: prompt },
      ],
    });
    return result.text.trim();
  }

  private async askJson<T>(capability: DirectorCapability & { skillContent: string }, prompt: string): Promise<T> {
    const text = await this.ask(capability, prompt);
    const cleaned = text.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Agent returned no JSON result");
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      throw new Error("Agent returned invalid JSON result");
    }
  }

  private evidence(capability: DirectorCapability): DelegationEvidence {
    return {
      role: capability.harnessRole,
      agentKey: capability.agentKey,
      agentName: capability.agentName,
      skillId: capability.skillId,
      skillName: capability.skillName,
      modelName: capability.modelName,
    };
  }

  private normaliseAssets(value: AssetDraft): AssetDraft {
    const raw = value as any;
    const candidates = [raw, raw?.assets, raw?.updatedAssets, raw?.result, raw?.data].filter(item => item && typeof item === "object" && !Array.isArray(item));
    const root = candidates.find(item => item.characters || item.props || item.locations || item.roles || item.scenes) || raw;
    const flat = [raw?.assets, raw?.updatedAssets, raw?.result, raw?.data].find(Array.isArray) as any[] | undefined;
    const byType = (types: string[]) => flat?.filter(item => types.includes(String(item?.type || item?.category || item?.assetType || "").toLowerCase())) || [];
    const normalise = (items: unknown) => Array.isArray(items)
      ? items.slice(0, 12).map((item: any) => ({
        name: this.requireText(item?.name, "asset name"),
        description: this.requireText(item?.description || item?.desc, "asset description"),
        prompt: this.requireText(item?.prompt, "asset prompt"),
      }))
      : [];
    const result = {
      characters: normalise(root?.characters || root?.roles || root?.characterAssets || byType(["character", "role", "人物", "角色"])),
      props: normalise(root?.props || root?.propAssets || root?.tools || byType(["prop", "tool", "道具"])),
      locations: normalise(root?.locations || root?.locationAssets || root?.scenes || byType(["location", "scene", "场景", "地点"])),
    };
    if (!result.characters.length && !result.props.length && !result.locations.length) {
      throw new Error(`Asset Agent returned no usable assets (keys: ${Object.keys(raw || {}).join(", ") || "none"})`);
    }
    return result as AssetDraft;
  }

  private mergeExistingAssets(existing: Pick<AssetDraft, "characters" | "props" | "locations">, incoming: AssetDraft): Pick<AssetDraft, "characters" | "props" | "locations"> {
    let matched = 0;
    const merge = (current: AssetDraft["characters"], updates: AssetDraft["characters"]) => current.map(item => {
      const update = updates.find(candidate => candidate.name === item.name);
      if (!update) return item;
      matched += 1;
      return { name: item.name, description: update.description, prompt: update.prompt };
    });
    const result = {
      characters: merge(existing.characters, incoming.characters),
      props: merge(existing.props, incoming.props),
      locations: merge(existing.locations, incoming.locations),
    };
    if (!matched) throw new Error("Asset Agent did not preserve any existing asset names");
    return result;
  }

  private requireText(value: unknown, label: string): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new Error(`Agent returned an empty ${label}`);
    return text;
  }

  private optionalText(value: unknown): string | undefined {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  }

  private numberOr(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

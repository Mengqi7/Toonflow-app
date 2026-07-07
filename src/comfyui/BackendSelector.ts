/**
 * BackendSelector — 根据 shot 类型智能选择 API 或 ComfyUI
 *
 * 选择逻辑:
 * 1. userPreference 优先
 * 2. 风格化强 (saturation=desaturated) → ComfyUI
 * 3. close-up 特写 → ComfyUI (IP-Adapter)
 * 4. 用户上传了参考图 → ComfyUI (ControlNet)
 * 5. ComfyUI 不可用 → API
 * 6. 默认 → API (速度快)
 */
import { db } from "@/utils/db";

export interface BackendChoice {
  backend: "api" | "comfyui";
  workflowId?: number;
  apiModel?: string;
  reason: string;
}

export class BackendSelector {
  /**
   * 选择后端
   * @param shot 分镜对象
   * @param style 视觉风格
   * @param userPreference 用户偏好 (api/comfyui/auto)
   * @param hasReferenceImage 是否有参考图
   */
  async chooseBackend(
    shot: any,
    style: any,
    userPreference: "api" | "comfyui" | "auto" = "auto",
    hasReferenceImage: boolean = false,
  ): Promise<BackendChoice> {
    // 1. 用户偏好优先
    if (userPreference === "api") {
      return { backend: "api", apiModel: "1:default", reason: "用户偏好 API" };
    }
    if (userPreference === "comfyui") {
      const workflowId = await this.findBestWorkflow(shot, style);
      if (workflowId) {
        return { backend: "comfyui", workflowId, reason: "用户偏好 ComfyUI" };
      }
      return { backend: "api", apiModel: "1:default", reason: "用户偏好 ComfyUI 但无可用服务, 降级到 API" };
    }

    // 2. 检查 ComfyUI 是否可用
    const comfyAvailable = await this.isComfyAvailable();
    if (!comfyAvailable) {
      return { backend: "api", apiModel: "1:default", reason: "ComfyUI 不可用, 降级到 API" };
    }

    // 3. 风格化强 → ComfyUI
    const saturation = style?.colorPalette?.saturation || "";
    if (saturation === "desaturated") {
      const workflowId = await this.findBestWorkflow(shot, style);
      if (workflowId) {
        return { backend: "comfyui", workflowId, reason: "强风格化场景使用 ComfyUI 定制工作流" };
      }
    }

    // 4. close-up 特写 → ComfyUI (IP-Adapter)
    const shotType = (shot?.shotType || shot?.type || "").toLowerCase();
    if (shotType.includes("close-up") || shotType.includes("特写")) {
      const workflowId = await this.findPortraitWorkflow();
      if (workflowId) {
        return { backend: "comfyui", workflowId, reason: "特写镜头使用 IP-Adapter 保证角色一致性" };
      }
    }

    // 5. 有参考图 → ComfyUI (ControlNet)
    if (hasReferenceImage) {
      const workflowId = await this.findControlNetWorkflow();
      if (workflowId) {
        return { backend: "comfyui", workflowId, reason: "有参考图使用 ControlNet 工作流" };
      }
    }

    // 6. 默认 → API
    return { backend: "api", apiModel: "1:default", reason: "默认使用 API (速度快)" };
  }

  /** 检查 ComfyUI 是否可用 */
  private async isComfyAvailable(): Promise<boolean> {
    try {
      const server = await db("o_comfyui_server").where("enabled", 1).first();
      return !!server;
    } catch {
      return false;
    }
  }

  /** 查找最匹配的工作流 */
  private async findBestWorkflow(shot: any, style: any): Promise<number | undefined> {
    try {
      const workflows = await db("o_comfyui_workflow").where("type", "like", "%image%");
      if (workflows.length === 0) return undefined;
      return workflows[0].id;
    } catch {
      return undefined;
    }
  }

  /** 查找人像工作流 */
  private async findPortraitWorkflow(): Promise<number | undefined> {
    try {
      const wf = await db("o_comfyui_workflow")
        .where("type", "like", "%portrait%")
        .orWhere("name", "like", "%portrait%")
        .orWhere("name", "like", "%人像%")
        .first();
      return wf?.id;
    } catch {
      return undefined;
    }
  }

  /** 查找 ControlNet 工作流 */
  private async findControlNetWorkflow(): Promise<number | undefined> {
    try {
      const wf = await db("o_comfyui_workflow")
        .where("name", "like", "%controlnet%")
        .orWhere("name", "like", "%canny%")
        .first();
      return wf?.id;
    } catch {
      return undefined;
    }
  }
}

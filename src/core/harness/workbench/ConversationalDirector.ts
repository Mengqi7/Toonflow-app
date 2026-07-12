import { createHash } from "crypto";
import type { ToolRuntime } from "../tools/ToolRuntime";
import type { ProjectContext } from "./contracts";
import { DirectorToolPlanner, type PlannedToolInstruction } from "./DirectorToolPlanner";

export class ConversationalDirector {
  private readonly planner: DirectorToolPlanner;

  constructor(private readonly runtime: ToolRuntime) {
    this.planner = new DirectorToolPlanner(runtime.registry);
  }

  async executeInstruction(instanceId: string, message: string, context: ProjectContext, confirmed = false) {
    const planned = await this.planInstruction(message, context);
    const idempotencyKey = createHash("sha256")
      .update(JSON.stringify({ instanceId, message, selected: context.selected.map(ref => ref.id), input: planned.input }))
      .digest("hex");
    return this.runtime.execute({
      instanceId,
      userInstruction: message,
      context,
      plan: planned.plan,
      toolName: planned.toolName,
      input: planned.input,
      idempotencyKey,
      confirmed,
    });
  }

  planInstruction(message: string, context: ProjectContext): Promise<PlannedToolInstruction> {
    return this.planner.plan(message, context);
  }
}

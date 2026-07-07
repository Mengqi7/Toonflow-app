import { harness } from "../src/core/harness/init";
import { ScreenwriterAgent } from "../src/agents/screenwriter/ScreenwriterAgent";

async function main() {
  await harness.workflowRunner.setAgentRegistry(harness.agentRegistry);
  await harness.workflowRunner.setHarnessDeps({
    memoryBus: harness.memoryBus,
    rulesEngine: harness.rulesEngine,
    skillsRegistry: harness.skillsRegistry,
    mcpConnector: harness.mcpConnector,
  });

  const agent = new ScreenwriterAgent();
  await agent.init({
    instanceId: "test", nodeId: "screenwriter.generate", projectId: 1,
    input: { stage: "generate" },
    config: { novel: "在一个风雨交加的夜晚，年轻侦探李明收到了匿名信。" },
    memoryBus: harness.memoryBus, rulesEngine: harness.rulesEngine,
    skillsRegistry: harness.skillsRegistry, mcpConnector: harness.mcpConnector,
  } as any);

  try {
    const result = await agent.execute({
      instanceId: "test", nodeId: "screenwriter.generate", projectId: 1,
      input: { stage: "generate" },
      config: { novel: "在一个风雨交加的夜晚，年轻侦探李明收到了匿名信。" },
      memoryBus: harness.memoryBus, rulesEngine: harness.rulesEngine,
      skillsRegistry: harness.skillsRegistry, mcpConnector: harness.mcpConnector,
    } as any);
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("FAILED:", e);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
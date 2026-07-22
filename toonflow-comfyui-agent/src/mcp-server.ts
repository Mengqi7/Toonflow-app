import readline from "node:readline";
import { WorkflowGenerator } from "./WorkflowGenerator";
import { WorkflowTester } from "./WorkflowTester";
import { TemplateLibrary } from "./TemplateLibrary";

const generator = new WorkflowGenerator();
const tester = new WorkflowTester();
const templates = new TemplateLibrary();

function write(message: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message as object })}\n`);
}

async function handle(request: any): Promise<any> {
  if (request.method === "initialize") return { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "toonflow-comfyui-agent", version: "1.0.0" } };
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: [
    { name: "generateWorkflow", description: "Generate a ComfyUI workflow from a description.", inputSchema: { type: "object", properties: { description: { type: "string" }, template: { type: "string" } }, required: ["description"] } },
    { name: "testWorkflow", description: "Validate a ComfyUI workflow.", inputSchema: { type: "object", properties: { workflow: { type: "object" } }, required: ["workflow"] } },
    { name: "optimizeWorkflow", description: "Return a validated workflow and optimization suggestions.", inputSchema: { type: "object", properties: { workflow: { type: "object" } }, required: ["workflow"] } },
  ] };
  if (request.method === "tools/call") {
    const args = request.params?.arguments || {};
    if (request.params?.name === "generateWorkflow") return { structuredContent: await generator.generate(String(args.description), args.template) };
    if (request.params?.name === "testWorkflow") return { structuredContent: tester.validate(args.workflow) };
    if (request.params?.name === "optimizeWorkflow") return { structuredContent: { workflow: args.workflow, validation: tester.validate(args.workflow), templates: templates.listAll().map(item => item.id) } };
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${request.params?.name}` }] };
  }
  return {};
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async line => {
  line = line.replace(/^\uFEFF/, "");
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    write({ id: request.id, result: await handle(request) });
  } catch (error) {
    write({ id: null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
  }
});

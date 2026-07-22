import type { WorkflowJSON } from "./types";
export interface TestResult { passed: boolean; errors: string[]; suggestions: string[]; }
export class WorkflowTester {
  validate(wf: WorkflowJSON): TestResult {
    const errors: string[] = [];
    if (!wf.nodes?.length) errors.push("No nodes");
    if (!wf.links?.length) errors.push("No links");
    const nodeIds = new Set((wf.nodes || []).map(node => node.id));
    for (const link of wf.links || []) {
      if (!nodeIds.has(link[0]) || !nodeIds.has(link[2])) errors.push(`Dangling link ${link[0]} -> ${link[2]}`);
    }
    return {
      passed: errors.length === 0,
      errors,
      suggestions: errors.map(error => `Fix: ${error}`),
    };
  }

  async autoTest(gen: (prompt: string) => Promise<string>, desc: string, max = 3): Promise<{ wf: WorkflowJSON; history: TestResult[] }> {
    const history: TestResult[] = [];
    let wf: WorkflowJSON = { version: 1, nodes: [], links: [] };
    let feedback = "";
    for (let attempt = 0; attempt < max; attempt++) {
      try {
        const raw = await gen(`${desc}${feedback ? `\n\nPrevious validation feedback:\n${feedback}` : ""}`);
        wf = JSON.parse(raw.replace(/\x60{3}json?\s*/g, "").replace(/\x60{3}/g, "").trim());
      } catch (error) {
        feedback = `The response was not valid workflow JSON: ${error instanceof Error ? error.message : String(error)}`;
      }
      const result = this.validate(wf);
      history.push(result);
      if (result.passed) break;
      feedback = [...result.errors, ...result.suggestions].join("\n");
    }
    return { wf, history };
  }
}

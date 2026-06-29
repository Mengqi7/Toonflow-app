import type { WorkflowJSON } from "./types";
export interface TestResult { passed: boolean; errors: string[]; suggestions: string[]; }
export class WorkflowTester {
  validate(wf: WorkflowJSON): TestResult { const e: string[] = []; if(!wf.nodes?.length) e.push("No nodes"); if(!wf.links?.length) e.push("No links"); return { passed: e.length===0, errors: e, suggestions: [] }; }
  async autoTest(gen: (p:string)=>Promise<string>, desc: string, max=3): Promise<{wf:WorkflowJSON;history:TestResult[]}> { const h: TestResult[] = []; let wf: WorkflowJSON = {version:1,nodes:[],links:[]}; for(let i=0;i<max;i++){ try{ const r=await gen(desc); wf=JSON.parse(r.replace(/\x60{3}json?\s*/g,"").replace(/\x60{3}/g,"").trim()); }catch{} const t=this.validate(wf); h.push(t); if(t.passed) break; } return {wf,history:h}; }
}
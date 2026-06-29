export interface WorkflowJSON { version: number; nodes: { id: number; type: string; pos: [number,number]; size: [number,number]; widgets_values?: any[]; title?: string }[]; links: number[][]; }

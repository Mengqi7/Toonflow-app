## Context

Harness already has typed production stages, a tool runtime, persisted ActionRuns and SSE events. The regression is at the boundary between these systems and the right-hand Director dock: the component is incomplete, event types are not fully consumed, and a simple natural-language start instruction does not reliably select the end-to-end pipeline. The Director must remain the control surface while existing Toonflow screenplay, asset and production workspaces remain the artifact surfaces.

## Goals / Non-Goals

**Goals:**

- Make start, continue and full-production language resolve to a deterministic, persisted pre-production pipeline.
- Expose planning, delegation, tools, progress, quality reviews, reroutes and next actions as live Director evidence.
- Make the Director readable and resizable, and make every registered Agent's configured prompt inspectable.
- Project stage outputs into the relevant existing Toonflow workspace without browser refresh.

**Non-Goals:**

- Replacing the existing screenplay, asset, storyboard or media-generation domain modules.
- Calling ComfyUI or changing third-party image/video provider integrations.
- Automatically dispatching costly video generation without explicit confirmation.

## Decisions

### Preserve the typed Harness pipeline as the execution authority

The Director planner will normalize conversational commands such as "start" to the existing `production.pipeline` tool. Stage progression, quality gates and domain writes remain server-side, so a page navigation or dock resize cannot lose the production state. A front-end-only sequence was rejected because it cannot provide reliable retries, idempotency or reviews.

### Treat SSE as the live source of execution evidence

The dock will listen for plan, tool, review and UI-patch events and merge them into the matching persisted ActionRun. The initiating request remains synchronous for compatibility, but visible timeline events arrive while it is pending. Replacing the route with a background-job API is deferred because it requires a larger client contract and migration.

### Keep human confirmation at provider-cost and final-approval boundaries

Automatic progression covers novel analysis through storyboard generation only when the workflow is eligible and quality passes. Video/provider dispatch remains an explicit confirmation action. This preserves the desired autonomous loop without hidden provider spend.

### Project artifacts through existing domain refresh contracts

Each UI patch increments the workbench refresh revision and emits a browser event. Existing views subscribe, reload their own data and focus the appropriate local artifact. This avoids a duplicate artifact database or a new workbench canvas.

## Risks / Trade-offs

- [Long AI calls can make the browser appear idle] -> Timeline entries and percentage updates are emitted before and during every stage.
- [Automatic advancement can create unwanted work] -> It is controlled by an explicit auto-progression toggle and stops before video generation, review failures and confirmation boundaries.
- [Agent configuration may contain sensitive prompt/model details] -> The detail panel exposes only the project-authorized configuration already returned by the capability endpoint.
- [Legacy generation output can be weak] -> Asset prompts gain structured production constraints and the existing review/reroute loop evaluates them before continuation.

## Migration Plan

1. Add recovery and observability behavior without changing persisted ActionRun or domain schema.
2. Deploy with automatic progression disabled by default for existing projects.
3. Retain all existing routes and legacy Agent settings; rollback only requires disabling the Director dock feature flag/build.

## Open Questions

- The final acceptance threshold for image-prompt review can be tuned after real project samples are collected.

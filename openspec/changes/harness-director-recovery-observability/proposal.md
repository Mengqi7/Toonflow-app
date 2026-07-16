## Why

The current AI Director can leave a production run in an indeterminate state after a simple "start" instruction, while the UI hides the plan, participating agents, tool input/output, review outcome and generated artifacts. This makes the Harness loop neither dependable nor understandable to the user.

## What Changes

- Restore deterministic handling of start, continue and full-production instructions so a project with novel content can progress through the pre-production workflow without manual route-specific checkboxes.
- Make the Director emit and display a live execution timeline covering plans, Agent/Skill/model delegation, tool calls, progress, artifacts, reviews, reroutes and next actions.
- Make all 19 registered Harness capabilities inspectable with their role, system prompt, skill and model configuration.
- Improve the Director dock with a persistent resizable readable layout and an explicit automatic progression control.
- Refresh and focus affected Toonflow workspaces when Harness writes new screenplay, asset or storyboard data.

## Capabilities

### New Capabilities
- `director-workflow-recovery`: Deterministic full-workflow start and continuation behavior with bounded automatic progression.
- `director-execution-observability`: Live, human-readable execution evidence and inspectable Agent capability detail.
- `director-artifact-projection`: Streaming artifact projection and workspace refresh/focus for Director-generated results.

### Modified Capabilities
- `conversational-workbench`: The Director interaction contract gains autonomous workflow planning, observable review/reroute behavior and richer capability inspection.
- `agent-tool-runtime`: Runtime event delivery gains plan, review and artifact projection evidence needed by the conversation UI.

## Impact

Affected areas include the Harness Director planner/runtime and production stage service, the workbench event route, the Director dock and store, and the existing screenplay, asset and production workspace views. No new generation provider integration is introduced.

## 1. Product and data contracts

- [x] 1.1 Freeze the old Harness control-room UI as a developer monitor only and remove it from the user production navigation
- [x] 1.2 Define Project, Episode, Script, Beat, Scene, Shot, Character, Prop, Location and Artifact IDs
- [x] 1.3 Define ActionRun, DomainEvent and UI Patch contracts
- [x] 1.4 Define the first LaperAI-parity acceptance case for one episode and six shots

## 2. Context engine

- [x] 2.1 Implement route, selection and visible-object context extraction
- [x] 2.2 Implement project and episode context loaders
- [x] 2.3 Implement related-entity and upstream/downstream artifact resolution
- [x] 2.4 Add bounded-context metadata and source trace records

## 3. Agent tool runtime

- [x] 3.1 Implement ToolRegistry and JSON Schema validation
- [x] 3.2 Implement ActionRun persistence and idempotency keys
- [x] 3.3 Implement command execution through domain services instead of DOM or direct SQL
- [x] 3.4 Implement tool progress, cancellation, retry and failure recovery events
- [x] 3.5 Connect DirectorOrchestrator to context-aware planning and tool selection

## 4. Domain tool adapters

- [x] 4.1 Wrap script read/create/update operations
- [x] 4.2 Wrap beat and scene read/create/update operations
- [x] 4.3 Wrap character, prop and location operations
- [x] 4.4 Wrap storyboard planning, shot update and image generation
- [x] 4.5 Wrap video, audio and timeline operations
- [x] 4.6 Wrap review, approval, reroute and rollback operations

## 5. Artifact graph and provider layer

- [x] 5.1 Implement stable artifact links across script, scene, shot and generated media
- [x] 5.2 Extend artifact provenance with ActionRun, provider, model and prompt version
- [x] 5.3 Implement provider-neutral text, image, video and audio adapters
- [x] 5.4 Implement normalized generation job status and cancellation

## 6. Conversational workbench UI

- [x] 6.1 Upgrade the existing Toonflow project shell with a persistent LaperAI-inspired AI Director
- [x] 6.2 Connect existing novel, script Agent and script pages to workbench context
- [x] 6.3 Connect existing character, prop and location pages to workbench context
- [x] 6.4 Connect the existing production storyboard canvas, shot cards and inspector
- [x] 6.5 Connect the existing video workspace and media timeline
- [x] 6.6 Upgrade DirectorChatWindow with plans, tool calls, confirmations and results
- [x] 6.7 Apply DomainEvents and UI Patches to refresh active workspace inline

## 7. Validation

- [x] 7.1 Validate natural-language scene creation end to end
- [x] 7.2 Validate natural-language storyboard revision end to end
- [x] 7.3 Validate batch generation confirmation and cancellation
- [x] 7.4 Validate artifact version history and rollback
- [x] 7.5 Validate provider failure, retry and no-mock behavior
- [x] 7.6 Validate desktop and narrow viewport layout

## 8. Acceptance repair: one Director and executable production stages

- [x] 8.1 Remove the legacy Script Agent and Production Agent chat panels from the user-facing workspaces
- [x] 8.2 Bridge the configured legacy Script/Production Agent profiles and skills into typed Harness production-stage tools
- [x] 8.3 Add deterministic Director planning for screenplay, asset, storyboard, video and pre-production pipeline instructions
- [x] 8.4 Surface delegated role progress, confirmation and completion evidence in the persistent Director panel
- [x] 8.5 Verify a no-mouse novel-to-storyboard flow, video confirmation/cancellation, persisted ActionRuns and no duplicate chat UI

## 9. Unified Director intelligence and legacy capability restoration

- [x] 9.1 Build one capability catalog from Harness agents, Toonflow Agent deployments and all editable Skill files
- [x] 9.2 Make Agent model and Skill settings the runtime source of truth for Director delegation
- [x] 9.3 Restore story skeleton, adaptation strategy, screenplay, asset, director-plan, storyboard and video stages behind typed Harness tools
- [x] 9.4 Persist intermediate outputs into the existing Toonflow script and production workspaces and emit refresh patches
- [x] 9.5 Support contextual start, continue, revise, status and general conversation without reporting read-only context as completed production work
- [x] 9.6 Show delegated Agent, Skill, model, artifacts and next action in AI Director and verify the complete no-mouse workflow

## 10. Acceptance repair: executable quality loop

- [x] 10.1 Promote story skeleton, adaptation strategy and director plan to stable reviewable stage artifacts
- [x] 10.2 Route manual review instructions deterministically to the latest valid project artifact
- [x] 10.3 Connect the configured AI model to ReviewPipeline and persist score, issues and decisions
- [x] 10.4 Automatically review nested development and pipeline outputs without reporting placeholder review steps
- [x] 10.5 Add one bounded Agent regeneration attempt using structured review feedback
- [x] 10.6 Show review attempts, scores, issues and reroute evidence in AI Director
- [x] 10.7 Verify start, automatic review, manual review, failure reroute and continuation end to end

## ADDED Requirements

### Requirement: AI Director must operate as the primary project control surface

The system SHALL provide a persistent AI Director conversation in every film-production workspace, and SHALL treat messages as executable project instructions rather than chat-only content.

#### Scenario: User asks to revise a shot
- **WHEN** the user says “把第 3 场的第 2 个镜头改成中近景，保留人物服装和场景不变”
- **THEN** the system resolves the current episode, scene, shot and locked references
- **AND** creates a structured execution plan
- **AND** shows the affected objects before applying the change

### Requirement: Conversation results must include operation evidence

The system SHALL show the plan, tools used, changed fields, generated artifacts, versions and review status for every write operation.

#### Scenario: Tool execution completes
- **WHEN** a tool successfully updates a storyboard shot
- **THEN** the conversation shows the updated shot ID and changed fields
- **AND** the active storyboard workspace refreshes without a full page reload
- **AND** an ActionRun is persisted

### Requirement: High-impact actions must require user confirmation

The system SHALL require confirmation before batch generation, destructive changes, cross-stage reroutes, rollback and final approval.

#### Scenario: User requests batch image generation
- **WHEN** the user asks to generate images for all shots in a scene
- **THEN** the system shows count, estimated provider calls, target objects and expected artifacts
- **AND** waits for explicit confirmation before dispatching generation

### Requirement: AI Director must dispatch the full production sequence through typed stages

The system SHALL interpret screenplay, asset, storyboard, video and full pre-production instructions deterministically before falling back to a general LLM planner. Each stage SHALL execute through a typed Harness tool, persist its result in Toonflow domain data and report the delegated role, produced artifact IDs and next review or confirmation point.

#### Scenario: User starts from a novel
- **WHEN** the user says to start production from the novel in the persistent AI Director
- **THEN** the Director runs screenplay, asset and storyboard stages using the configured Script and Production Agent profiles and skills
- **AND** writes screenplay, production asset and storyboard records to the current project
- **AND** leaves video generation pending explicit confirmation

### Requirement: AI Director must maintain conversational production continuity

The system SHALL interpret short contextual instructions such as start, continue, revise, retry and show status from the current project state and recent ActionRuns. General questions SHALL receive a conversational answer. A read-only context lookup SHALL NOT be presented as completed production work.

#### Scenario: User says continue
- **WHEN** the user says "continue" after screenplay development or asset creation
- **THEN** the Director selects the next incomplete production stage from persisted project state
- **AND** reports the delegated Agent, Skill, model, produced artifacts and next action

#### Scenario: User asks a general project question
- **WHEN** no write or generation action is required
- **THEN** the Director answers using bounded project context
- **AND** does not fabricate an ActionRun that claims a production artifact was created

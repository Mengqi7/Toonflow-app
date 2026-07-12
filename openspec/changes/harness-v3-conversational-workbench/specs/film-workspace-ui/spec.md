## ADDED Requirements

### Requirement: Workbench must use project navigation, domain workspace and context panel

The system SHALL upgrade Toonflow's existing project shell into a LaperAI-inspired layout with the existing production navigation on the left/top, the active existing film domain page in the center and a persistent AI Director panel on the right.

#### Scenario: User opens the storyboard workspace
- **WHEN** the user opens an episode storyboard
- **THEN** the left navigation shows script, beats, storyboard, scenes, characters, props, locations and assets
- **AND** the center reuses the existing production storyboard canvas or shot list
- **AND** the right side shows the selected shot properties, versions and AI Director conversation

### Requirement: Each domain workspace must expose production objects

The system SHALL reuse and upgrade Toonflow's existing novel, script Agent, script, character/scene/prop, production, asset and video workspaces, with domain-specific editing and generation controls.

#### Scenario: User opens characters
- **WHEN** the user selects Characters
- **THEN** the workspace displays character cards, reference images, attributes, related scenes and generation history
- **AND** the AI Director can create or update a character from conversation

### Requirement: AI changes must appear inline in the active workspace

The system SHALL update visible cards, fields, lists or canvas nodes after a successful tool execution.

#### Scenario: AI fills scene data
- **WHEN** the AI completes a scene description tool call
- **THEN** the selected scene card displays the new description
- **AND** the conversation shows the changed fields and version

### Requirement: A user workspace must expose only one conversational control surface

The system SHALL use the persistent AI Director as the only user-facing conversational control surface on Script Agent and Production workspaces. Legacy chat panels SHALL not render or establish their old chat connections, while their domain pages continue to show editable screenplay and production outputs.

#### Scenario: User opens Script Agent or Production
- **WHEN** the user opens either workspace
- **THEN** the center area displays the existing screenplay editor or production canvas without a second chat panel
- **AND** the right-side AI Director remains available for all instructions and confirmation actions

### Requirement: Director evidence must identify delegated capabilities

The persistent Director panel SHALL display each delegated Agent role, Toonflow deployment, Skill, resolved model, stage status, produced artifact links and next action. Failed model configuration or malformed Agent output SHALL be shown as a recoverable failure and SHALL NOT be labeled completed.

#### Scenario: Story development completes
- **WHEN** the skeleton and adaptation Agents finish
- **THEN** the conversation identifies both delegated capabilities and their output destinations
- **AND** the Script Agent workspace refreshes to show the generated documents

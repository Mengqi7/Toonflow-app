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

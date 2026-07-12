## ADDED Requirements

### Requirement: Context engine must resolve project and page context

The system SHALL resolve project, episode, current route, selected objects, visible objects, pending reviews and recent ActionRuns before planning a conversation instruction.

#### Scenario: User asks to fix the current shot
- **WHEN** the user sends a message from the storyboard workspace with a selected shot
- **THEN** the context includes the selected shot, its scene, related characters, props, location, prompt versions and review reports
- **AND** the planner does not require the user to repeat those identifiers

### Requirement: Context must be bounded and auditable

The system SHALL include context source IDs and token-budget metadata in every planner request.

#### Scenario: Context is assembled
- **WHEN** the planner request is created
- **THEN** each context block identifies its source entity and timestamp
- **AND** omitted context is recorded as a reasoned exclusion

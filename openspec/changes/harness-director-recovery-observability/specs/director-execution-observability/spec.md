## ADDED Requirements

### Requirement: Director must expose live execution evidence
The system SHALL display a live ordered timeline for each Director ActionRun including its plan, participating Agent, Skill, configured model, tool calls, progress messages, output summary, review score, reroute and next action.

#### Scenario: A pipeline is executing
- **WHEN** the Harness runtime emits plan, tool, review or reroute events
- **THEN** the matching Director conversation entry SHALL update without waiting for the final response
- **AND** the event SHALL identify the stage or Agent responsible for the work

### Requirement: Agent capability details must be inspectable
The system SHALL provide an expandable view for every registered enabled or disabled Agent that exposes its role, system prompt, skill and selected model.

#### Scenario: User opens an Agent capability
- **WHEN** the user selects an Agent in the Director capabilities panel
- **THEN** the system SHALL show the Agent's configured system prompt and related skill/model metadata


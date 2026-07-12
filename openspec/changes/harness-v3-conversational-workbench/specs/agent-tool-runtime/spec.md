## ADDED Requirements

### Requirement: Agent tools must be registered with typed schemas

The system SHALL register every AI-operable domain action with a name, description, JSON Schema input, authorization level, idempotency strategy and output contract.

#### Scenario: Storyboard update tool is registered
- **WHEN** the Harness runtime initializes
- **THEN** `storyboard.update_shot` is discoverable with required shot ID, patch fields and expected output schema
- **AND** the tool declares whether user confirmation is required

### Requirement: Tool execution must be idempotent and observable

The system SHALL execute tools with an ActionRun ID and idempotency key, and SHALL emit started, progress, completed or failed domain events.

#### Scenario: Tool is retried
- **WHEN** the same ActionRun is submitted again after a network interruption
- **THEN** the tool does not create duplicate scene, asset or artifact records
- **AND** the conversation receives the original execution result

### Requirement: Tool failures must produce recoverable instructions

The system SHALL return human-readable failure reasons, retry instructions and safe next actions when a tool fails.

#### Scenario: Provider generation fails
- **WHEN** an image provider returns a quota or timeout error
- **THEN** the runtime records the provider error
- **AND** suggests retry, provider switch or manual edit
- **AND** does not fabricate a successful artifact

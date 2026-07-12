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

### Requirement: Legacy agent capabilities must be callable without legacy chat transport

The system SHALL expose existing Script Agent and Production Agent model profiles and skills through typed Harness tools rather than requiring the legacy Socket.IO chat views. The bridge SHALL preserve ActionRun provenance, progress events, cancellation and normal domain-service writes.

#### Scenario: Production stage invokes a legacy profile
- **WHEN** the Director runs a screenplay or storyboard stage
- **THEN** the runtime invokes the corresponding configured legacy Agent profile and skill server-side
- **AND** writes only through Harness domain services
- **AND** records the delegated role and result in the ActionRun

### Requirement: Director capability discovery must use one configurable catalog

The system SHALL merge Harness role agents, Toonflow Agent deployment profiles and editable Skill files into one capability catalog. Skill files without frontmatter SHALL still be registered from their path and heading. Agent model changes and Skill content edits made in Toonflow settings SHALL affect the next Director execution without maintaining a second configuration system.

#### Scenario: User changes a screenplay Agent model or Skill
- **WHEN** the user updates the screenplay Agent model or edits its Skill in Toonflow settings
- **THEN** the next Director screenplay delegation resolves that deployment and current Skill content
- **AND** the ActionRun records the resolved Agent, Skill and model

### Requirement: Production stages must preserve legacy intermediate capabilities

The system SHALL expose story skeleton, adaptation strategy, screenplay, asset derivation, director planning, storyboard and video generation as typed Director stages. Intermediate text outputs SHALL be persisted to the existing Toonflow work data consumed by the Script Agent workspace.

#### Scenario: Director starts screenplay development
- **WHEN** the user asks to begin from the current novel
- **THEN** the Director delegates story skeleton and adaptation strategy before screenplay writing
- **AND** all three outputs appear in the existing Script Agent workspace

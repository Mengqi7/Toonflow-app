## ADDED Requirements

### Requirement: Generation capabilities must use provider adapters

The system SHALL expose text, image, video and audio generation through provider-neutral interfaces, while keeping provider and model selection in Toonflow settings.

#### Scenario: Agent requests an image
- **WHEN** the storyboard tool requests an image
- **THEN** the runtime resolves the configured image provider and model
- **AND** returns a normalized artifact result independent of the provider implementation

### Requirement: Provider operations must support cancellation and status polling

The system SHALL expose operation ID, progress, cancellation, retry and final status for long-running generation jobs.

#### Scenario: User cancels video generation
- **WHEN** the user cancels a running video job from the conversation
- **THEN** the provider adapter requests cancellation
- **AND** the job is marked cancelled without producing a completed artifact

### Requirement: ComfyUI must remain an implementation detail in phase one

The system SHALL not expose direct ComfyUI server, workflow or parameter controls in the conversational workbench during phase one.

#### Scenario: User generates an image
- **WHEN** the user requests image generation
- **THEN** the user sees normalized generation status and result
- **AND** does not need to interact with ComfyUI-specific controls

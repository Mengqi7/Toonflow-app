## ADDED Requirements

### Requirement: Director start commands must recover the production workflow
The system SHALL interpret start, begin production and equivalent Chinese conversational commands as a deterministic full pre-production workflow when the active project has novel content.

#### Scenario: User starts a project
- **WHEN** the user submits "开始" in the AI Director for a project containing novel chapters
- **THEN** the Director SHALL create a persisted ActionRun for story development, screenplay, assets, director planning and storyboard generation
- **AND** the run SHALL stop before provider-backed video generation pending explicit confirmation

### Requirement: Automatic progression must have bounded workflow gates
The system SHALL automatically continue only eligible, passed pre-production stages when the user enables automatic progression.

#### Scenario: A reviewed pre-production stage passes
- **WHEN** a stage completes with all quality reviews approved and automatic progression is enabled
- **THEN** the Director SHALL announce and dispatch the next eligible pre-production stage
- **AND** it SHALL stop for a failed review, an explicit confirmation boundary or video generation


## ADDED Requirements

### Requirement: Film entities must form a navigable artifact graph

The system SHALL link projects, episodes, scripts, beats, scenes, characters, props, locations, shots, images, video clips and audio tracks through stable IDs.

#### Scenario: User opens a shot
- **WHEN** the user selects a shot in the storyboard workspace
- **THEN** the system can navigate to its source scene, script passage, referenced character, prop and location
- **AND** can list all downstream image, video and audio artifacts

### Requirement: Every generated artifact must have provenance

The system SHALL store source Agent, ActionRun, provider, model, prompt version, input references, review result and artifact version for every generated output.

#### Scenario: Image is generated
- **WHEN** storyboard image generation completes
- **THEN** the image artifact is linked to its shot and input references
- **AND** its prompt, provider, model and review report are queryable

### Requirement: Rollback must create a new current version

The system SHALL never overwrite historical artifact versions during rollback.

#### Scenario: User rolls back a storyboard image
- **WHEN** the user selects version 2 as the desired rollback target
- **THEN** the system creates a new current version derived from version 2
- **AND** preserves all previous versions and the rollback reason

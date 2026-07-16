## ADDED Requirements

### Requirement: Director artifacts must refresh their production workspace
The system SHALL refresh the affected existing Toonflow workspace when a Director ActionRun writes screenplay, asset, director-plan or storyboard data.

#### Scenario: Asset stage produces project assets
- **WHEN** the asset Agent completes a Harness stage
- **THEN** the asset workspace SHALL reload its project data without a browser refresh
- **AND** the Director SHALL identify the produced artifacts in its execution evidence

### Requirement: Projected artifacts must be visible during execution
The system SHALL publish progress and artifact-preview information while a stage is running rather than presenting only a final result.

#### Scenario: Screenplay is being generated
- **WHEN** the screenplay Agent reports stage progress
- **THEN** the Director SHALL render the active progress message and the target artifact surface
- **AND** the screenplay workspace SHALL refresh after the write completes


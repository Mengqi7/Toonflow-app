## ADDED Requirements

### Requirement: Runtime events must provide Director observability
The system SHALL publish action-planning, tool lifecycle, review lifecycle, reroute and UI-patch events keyed by ActionRun ID.

#### Scenario: A reviewed tool is rerouted
- **WHEN** a Quality Supervisor rejects a stage result and the runtime dispatches a repair attempt
- **THEN** the runtime SHALL publish the rejection score and reroute target before the retry result
- **AND** the event payload SHALL be sufficient for the Director to associate it with the current ActionRun

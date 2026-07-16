## MODIFIED Requirements

### Requirement: AI Director must dispatch the full production sequence through typed stages
The system SHALL interpret screenplay, asset, storyboard, video, full pre-production, start and continue instructions deterministically before falling back to a general LLM planner. Each stage SHALL execute through a typed Harness tool, persist its result in Toonflow domain data and report the delegated role, produced artifact IDs, review outcome and next action.

#### Scenario: User starts from a novel
- **WHEN** the user says "开始" or asks to start production from the novel in the persistent AI Director
- **THEN** the Director SHALL run story development, screenplay, production asset, director plan and storyboard stages using configured Agent profiles and skills
- **AND** it SHALL write records to the current project and stream stage evidence to the conversation
- **AND** it SHALL leave video generation pending explicit confirmation

#### Scenario: User asks the Director to continue
- **WHEN** the user says "继续" after a passed stage
- **THEN** the Director SHALL select the next incomplete eligible production stage from persisted project state
- **AND** it SHALL report the delegated Agent, Skill, model, produced artifacts, review outcome and next action


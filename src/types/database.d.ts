// @db-hash be0a352d83989dbe44b26e457ed88775
//该文件由脚本自动生成，请勿手动修改

export interface memories {
  'content': string;
  'createTime': number;
  'embedding'?: string | null;
  'id'?: string;
  'isolationKey': string;
  'name'?: string | null;
  'relatedMessageIds'?: string | null;
  'role'?: string | null;
  'summarized'?: number | null;
  'type': string;
}
export interface o_action_run {
  'contextSnapshot': string;
  'createdAt': number;
  'episodeId'?: number | null;
  'error'?: string | null;
  'id'?: string | null;
  'idempotencyKey': string;
  'instanceId': string;
  'plan': string;
  'projectId': number;
  'result'?: string | null;
  'reviewState'?: string | null;
  'status': string;
  'toolCalls': string;
  'updatedAt': number;
  'userInstruction': string;
}
export interface o_agentDeploy {
  'desc'?: string | null;
  'disabled'?: boolean | null;
  'id'?: number;
  'key'?: string | null;
  'maxOutputTokens'?: number | null;
  'model'?: string | null;
  'modelName'?: string | null;
  'name'?: string | null;
  'temperature'?: number | null;
  'type'?: string | null;
  'vendorId'?: string | null;
}
export interface o_agentWorkData {
  'createTime'?: number | null;
  'data'?: string | null;
  'episodesId'?: number | null;
  'id'?: number;
  'key'?: string | null;
  'projectId'?: number | null;
  'updateTime'?: number | null;
}
export interface o_artifact_link {
  'actionRunId'?: string | null;
  'createdAt': number;
  'id'?: string | null;
  'metadata'?: string | null;
  'projectId': number;
  'relation': string;
  'sourceId': string;
  'sourceType': string;
  'targetId': string;
  'targetType': string;
}
export interface o_artifact_version {
  'actionRunId'?: string | null;
  'artifactKey': string;
  'artifactType': string;
  'content'?: string | null;
  'createdAt': number;
  'createdBy'?: string | null;
  'derivedFromVersion'?: number | null;
  'filePath'?: string | null;
  'id'?: number | null;
  'inputReferences'?: string | null;
  'instanceId': string;
  'model'?: string | null;
  'projectId': number;
  'promptVersion'?: string | null;
  'provider'?: string | null;
  'reason'?: string | null;
  'reviewFeedback'?: string | null;
  'reviewResult'?: string | null;
  'reviewScore'?: string | null;
  'source'?: string | null;
  'sourceAgent'?: string | null;
  'version': number;
}
export interface o_artStyle {
  'fileUrl'?: string | null;
  'id'?: number;
  'label'?: string | null;
  'name'?: string | null;
  'prompt'?: string | null;
}
export interface o_assets {
  'assetsId'?: number | null;
  'audioBindState'?: number | null;
  'createdBy'?: string | null;
  'describe'?: string | null;
  'flowId'?: number | null;
  'id'?: number;
  'imageId'?: number | null;
  'name'?: string | null;
  'projectId'?: number | null;
  'prompt'?: string | null;
  'promptErrorReason'?: string | null;
  'promptState'?: string | null;
  'remark'?: string | null;
  'scriptId'?: number | null;
  'source'?: string | null;
  'startTime'?: number | null;
  'type'?: string | null;
  'updateTime'?: number | null;
}
export interface o_assets2Storyboard {
  'assetId'?: number;
  'storyboardId'?: number;
}
export interface o_assetsRole2Audio {
  'assetsAudioId'?: number;
  'assetsRoleId'?: number;
}
export interface o_beat {
  'createdBy'?: string | null;
  'createTime': number;
  'episodeId': number;
  'id'?: number;
  'orderIndex'?: number | null;
  'projectId': number;
  'scriptId'?: number | null;
  'source'?: string | null;
  'status'?: string | null;
  'summary'?: string | null;
  'title': string;
  'updateTime': number;
}
export interface o_character_library {
  'accessories'?: string | null;
  'characterName'?: string | null;
  'createTime'?: number | null;
  'description'?: string | null;
  'hairStyle'?: string | null;
  'id'?: number;
  'outfitStyle'?: string | null;
  'projectId'?: number | null;
  'referenceImage'?: string | null;
  'updateTime'?: number | null;
}
export interface o_comfyui_server {
  'baseUrl'?: string | null;
  'createTime'?: number | null;
  'enabled'?: number | null;
  'id'?: number;
  'name'?: string | null;
  'wsUrl'?: string | null;
}
export interface o_comfyui_workflow {
  'createdBy'?: string | null;
  'createTime'?: number | null;
  'description'?: string | null;
  'id'?: number;
  'name'?: string | null;
  'parameters'?: string | null;
  'serverId'?: number | null;
  'thumbnail'?: string | null;
  'type'?: string | null;
  'updateTime'?: number | null;
  'workflow_json'?: string | null;
}
export interface o_comfyui_workflow_version {
  'changedParams'?: string | null;
  'createdBy'?: string | null;
  'createTime'?: number | null;
  'id'?: number | null;
  'version'?: number | null;
  'workflow_json': string;
  'workflowId'?: number | null;
}
export interface o_event {
  'createTime'?: number | null;
  'detail'?: string | null;
  'id'?: number;
  'name'?: string | null;
}
export interface o_eventChapter {
  'eventId'?: number | null;
  'id'?: number;
  'novelId'?: number | null;
}
export interface o_generation_job {
  'actionRunId': string;
  'capability': string;
  'createdAt': number;
  'error'?: string | null;
  'id'?: string | null;
  'operationId'?: string | null;
  'progress'?: number;
  'projectId': number;
  'providerId': string;
  'request': string;
  'result'?: string | null;
  'status': string;
  'updatedAt': number;
}
export interface o_image {
  'assetsId'?: number | null;
  'errorReason'?: string | null;
  'filePath'?: string | null;
  'id'?: number;
  'model'?: string | null;
  'resolution'?: string | null;
  'state'?: string | null;
  'type'?: string | null;
}
export interface o_imageFlow {
  'flowData': string;
  'id'?: number;
}
export interface o_memory {
  'embedding'?: any | null;
  'id'?: string | null;
  'key': string;
  'namespace': string;
  'timestamp': number;
  'ttl'?: number | null;
  'type': string;
  'value': string;
}
export interface o_modelPrompt {
  'fileName'?: string | null;
  'id'?: number;
  'model'?: string | null;
  'path'?: string | null;
  'vendorId'?: string | null;
}
export interface o_novel {
  'chapter'?: string | null;
  'chapterData'?: string | null;
  'chapterIndex'?: number | null;
  'createTime'?: number | null;
  'errorReason'?: string | null;
  'event'?: string | null;
  'eventState'?: number | null;
  'id'?: number;
  'projectId'?: number | null;
  'reel'?: string | null;
}
export interface o_production_asset {
  'assetType'?: string | null;
  'assetUrl'?: string | null;
  'createTime'?: number | null;
  'id'?: number | null;
  'instanceId'?: string | null;
  'nodeId'?: string | null;
  'projectId'?: number | null;
  'reviewScore'?: number | null;
  'status'?: string | null;
  'updateTime'?: number | null;
  'version'?: number | null;
}
export interface o_project {
  'artStyle'?: string | null;
  'createTime'?: number | null;
  'directorManual'?: string | null;
  'id'?: number | null;
  'imageModel'?: string | null;
  'imageQuality'?: string | null;
  'intro'?: string | null;
  'mode'?: string | null;
  'name'?: string | null;
  'projectType'?: string | null;
  'type'?: string | null;
  'userId'?: number | null;
  'videoModel'?: string | null;
  'videoRatio'?: string | null;
}
export interface o_prompt {
  'data'?: string | null;
  'id'?: number;
  'name'?: string | null;
  'type'?: string | null;
  'useData'?: string | null;
}
export interface o_prop_library {
  'createTime'?: number | null;
  'description'?: string | null;
  'id'?: number | null;
  'instanceId'?: string | null;
  'name': string;
  'projectId'?: number | null;
  'source'?: string | null;
  'type': string;
}
export interface o_review_preference {
  'confidence'?: number | null;
  'criterion'?: string | null;
  'id'?: string;
  'learnedValue'?: string | null;
  'projectId'?: number | null;
  'sampleCount'?: number | null;
  'updateTime'?: number | null;
  'userId'?: number | null;
}
export interface o_review_report {
  'attemptNumber'?: number | null;
  'createTime'?: number | null;
  'decision'?: string | null;
  'feedback'?: string | null;
  'id'?: string;
  'nodeId'?: string | null;
  'projectId'?: number | null;
  'scores'?: string | null;
  'targetId'?: string | null;
  'targetType'?: string | null;
  'totalScore'?: number | null;
  'workflowInstanceId'?: string | null;
}
export interface o_scene {
  'beatId'?: number | null;
  'characterIds'?: string | null;
  'createdBy'?: string | null;
  'createTime': number;
  'description'?: string | null;
  'episodeId': number;
  'id'?: number;
  'locationId'?: number | null;
  'orderIndex'?: number | null;
  'projectId': number;
  'propIds'?: string | null;
  'scriptId'?: number | null;
  'source'?: string | null;
  'status'?: string | null;
  'summary'?: string | null;
  'title': string;
  'updateTime': number;
}
export interface o_scene_library {
  'artDirection'?: string | null;
  'createTime'?: number | null;
  'id'?: number | null;
  'instanceId'?: string | null;
  'lightingSpec'?: string | null;
  'projectId'?: number | null;
  'sceneName': string;
  'source'?: string | null;
  'updateTime'?: number | null;
}
export interface o_script {
  'content'?: string | null;
  'createdBy'?: string | null;
  'createTime'?: number | null;
  'errorReason'?: string | null;
  'extractState'?: number | null;
  'id'?: number;
  'name'?: string | null;
  'projectId'?: number | null;
  'source'?: string | null;
  'updateTime'?: number | null;
}
export interface o_scriptAssets {
  'assetId'?: number;
  'scriptId'?: number;
}
export interface o_setting {
  'key'?: string | null;
  'value'?: string | null;
}
export interface o_skillAttribution {
  'attribution'?: string;
  'skillId'?: string;
}
export interface o_skillList {
  'createTime': number;
  'description': string;
  'embedding'?: string | null;
  'id'?: string;
  'md5': string;
  'name': string;
  'path': string;
  'state': number;
  'type': string;
  'updateTime': number;
}
export interface o_storyboard {
  'cameraMovement'?: string | null;
  'createTime'?: number | null;
  'duration'?: string | null;
  'filePath'?: string | null;
  'flowId'?: number | null;
  'id'?: number;
  'index'?: number | null;
  'lockedRefs'?: string | null;
  'projectId'?: number | null;
  'prompt'?: string | null;
  'reason'?: string | null;
  'sceneId'?: number | null;
  'scriptId'?: number | null;
  'shotSize'?: string | null;
  'shouldGenerateImage'?: number | null;
  'state'?: string | null;
  'track'?: string | null;
  'trackId'?: number | null;
  'updateTime'?: number | null;
  'videoDesc'?: string | null;
}
export interface o_style_library {
  'createTime'?: number | null;
  'description'?: string | null;
  'id'?: number | null;
  'name': string;
  'projectId'?: number | null;
  'tags'?: string | null;
  'updateTime'?: number | null;
  'visualStyleSpec'?: string | null;
}
export interface o_tasks {
  'describe'?: string | null;
  'id'?: number;
  'model'?: string | null;
  'projectId'?: number | null;
  'reason'?: string | null;
  'relatedObjects'?: string | null;
  'startTime'?: number | null;
  'state'?: string | null;
  'taskClass'?: string | null;
}
export interface o_user {
  'id'?: number;
  'name'?: string | null;
  'password'?: string | null;
}
export interface o_vendorConfig {
  'enable'?: number | null;
  'id'?: string;
  'inputValues'?: string | null;
  'models'?: string | null;
}
export interface o_video {
  'errorReason'?: string | null;
  'filePath'?: string | null;
  'id'?: number;
  'projectId'?: number | null;
  'scriptId'?: number | null;
  'state'?: string | null;
  'time'?: number | null;
  'videoTrackId'?: number | null;
}
export interface o_videoTrack {
  'duration'?: number | null;
  'id'?: number;
  'projectId'?: number | null;
  'prompt'?: string | null;
  'reason'?: string | null;
  'scriptId'?: number | null;
  'selectVideoId'?: number | null;
  'state'?: string | null;
  'videoId'?: number | null;
}
export interface o_workflow_state {
  'completedAt'?: number | null;
  'contextRefs'?: string | null;
  'definitionId': string;
  'id'?: string;
  'nodeStates'?: string | null;
  'projectId'?: number | null;
  'startedAt'?: number | null;
  'status'?: string;
  'userId'?: number | null;
}
export interface o_workflow_template {
  'category'?: string | null;
  'createTime'?: number | null;
  'definition': string;
  'description'?: string | null;
  'id'?: string | null;
  'isBuiltin'?: number | null;
  'name': string;
  'updateTime'?: number | null;
}

export interface DB {
  "memories": memories;
  "o_action_run": o_action_run;
  "o_agentDeploy": o_agentDeploy;
  "o_agentWorkData": o_agentWorkData;
  "o_artifact_link": o_artifact_link;
  "o_artifact_version": o_artifact_version;
  "o_artStyle": o_artStyle;
  "o_assets": o_assets;
  "o_assets2Storyboard": o_assets2Storyboard;
  "o_assetsRole2Audio": o_assetsRole2Audio;
  "o_beat": o_beat;
  "o_character_library": o_character_library;
  "o_comfyui_server": o_comfyui_server;
  "o_comfyui_workflow": o_comfyui_workflow;
  "o_comfyui_workflow_version": o_comfyui_workflow_version;
  "o_event": o_event;
  "o_eventChapter": o_eventChapter;
  "o_generation_job": o_generation_job;
  "o_image": o_image;
  "o_imageFlow": o_imageFlow;
  "o_memory": o_memory;
  "o_modelPrompt": o_modelPrompt;
  "o_novel": o_novel;
  "o_production_asset": o_production_asset;
  "o_project": o_project;
  "o_prompt": o_prompt;
  "o_prop_library": o_prop_library;
  "o_review_preference": o_review_preference;
  "o_review_report": o_review_report;
  "o_scene": o_scene;
  "o_scene_library": o_scene_library;
  "o_script": o_script;
  "o_scriptAssets": o_scriptAssets;
  "o_setting": o_setting;
  "o_skillAttribution": o_skillAttribution;
  "o_skillList": o_skillList;
  "o_storyboard": o_storyboard;
  "o_style_library": o_style_library;
  "o_tasks": o_tasks;
  "o_user": o_user;
  "o_vendorConfig": o_vendorConfig;
  "o_video": o_video;
  "o_videoTrack": o_videoTrack;
  "o_workflow_state": o_workflow_state;
  "o_workflow_template": o_workflow_template;
}

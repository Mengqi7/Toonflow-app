export type EntityKind =
  | "project"
  | "episode"
  | "script"
  | "beat"
  | "scene"
  | "shot"
  | "character"
  | "prop"
  | "location"
  | "artifact";

export type EntityId<K extends EntityKind> = string & { readonly __entityKind: K };

export type ProjectId = EntityId<"project">;
export type EpisodeId = EntityId<"episode">;
export type ScriptId = EntityId<"script">;
export type BeatId = EntityId<"beat">;
export type SceneId = EntityId<"scene">;
export type ShotId = EntityId<"shot">;
export type CharacterId = EntityId<"character">;
export type PropId = EntityId<"prop">;
export type LocationId = EntityId<"location">;
export type ArtifactId = EntityId<"artifact">;

const ID_PATTERN = /^(project|episode|script|beat|scene|shot|character|prop|location|artifact):(.+)$/;

export function entityId<K extends EntityKind>(kind: K, value: string | number): EntityId<K> {
  const normalized = String(value).trim();
  if (!normalized) throw new Error(`${kind} ID cannot be empty`);
  const existing = normalized.match(ID_PATTERN);
  if (existing) {
    if (existing[1] !== kind) throw new Error(`Expected ${kind} ID, received ${existing[1]} ID`);
    return normalized as EntityId<K>;
  }
  return `${kind}:${normalized}` as EntityId<K>;
}

export function parseEntityId<K extends EntityKind>(id: EntityId<K>, expectedKind?: K): { kind: K; value: string } {
  const match = String(id).match(ID_PATTERN);
  if (!match || (expectedKind && match[1] !== expectedKind)) {
    throw new Error(`Invalid ${expectedKind || "entity"} ID: ${id}`);
  }
  return { kind: match[1] as K, value: match[2] };
}

export function numericEntityId<K extends EntityKind>(id: EntityId<K>, expectedKind: K): number {
  const value = Number(parseEntityId(id, expectedKind).value);
  if (!Number.isSafeInteger(value)) throw new Error(`${id} does not contain a numeric database ID`);
  return value;
}

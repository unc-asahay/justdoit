/**
 * Serializer — JSON serialize/deserialize MemPalace for GitHub sync.
 */

import type {
  Palace, Wing, Room, MemoryEntry,
  SerializedPalace, SerializedWing, SerializedRoom, SerializedEntry,
} from './types';
import { MemPalace, setPalace } from './palace';

export function serializePalace(palace: MemPalace): SerializedPalace {
  const state = palace.exportState();

  const wings: SerializedWing[] = [];

  for (const [, wing] of state.wings) {
    const rooms: SerializedRoom[] = [];

    for (const [, room] of wing.rooms) {
      rooms.push({
        name: room.name,
        entries: room.entries.map(entry => ({
          id: entry.id,
          content: entry.content,
          timestamp: entry.timestamp,
          agentId: entry.agentId,
          agentName: entry.agentName,
          entities: entry.entities,
          metadata: entry.metadata,
        })),
      });
    }

    wings.push({ id: wing.id, metadata: wing.metadata, rooms });
  }

  return {
    projectSlug: state.projectSlug,
    version: '1.0',
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    wings,
  };
}

export function deserializePalace(data: SerializedPalace): MemPalace {
  const palace = new MemPalace(data.projectSlug);

  const wings = new Map<string, Wing>();

  for (const serializedWing of data.wings) {
    const rooms = new Map<string, Room>();

    for (const serializedRoom of serializedWing.rooms) {
      const entries: MemoryEntry[] = serializedRoom.entries.map(e => ({
        id: e.id,
        content: e.content,
        timestamp: e.timestamp,
        agentId: e.agentId,
        agentName: e.agentName,
        entities: e.entities,
        metadata: e.metadata,
      }));

      rooms.set(serializedRoom.name, { name: serializedRoom.name, entries });
    }

    wings.set(serializedWing.id, {
      id: serializedWing.id,
      rooms,
      metadata: serializedWing.metadata,
    });
  }

  palace.importState({
    projectSlug: data.projectSlug,
    wings,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });

  setPalace(data.projectSlug, palace);
  return palace;
}

export function palaceToJson(palace: MemPalace): string {
  return JSON.stringify(serializePalace(palace), null, 2);
}

export function palaceFromJson(json: string): MemPalace {
  const data = JSON.parse(json) as SerializedPalace;
  return deserializePalace(data);
}

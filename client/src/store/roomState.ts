import { z } from "zod";

const stateEventSchema = z.object({
  type: z.string(),
  state_key: z.string(),
  content: z.record(z.unknown()),
});

export interface RoomStateInfo {
  name?: string;
  topic?: string;
  alias?: string;
}

export function readRoomState(events: readonly unknown[]): RoomStateInfo {
  const info: RoomStateInfo = {};
  for (const raw of events) {
    const parsed = stateEventSchema.safeParse(raw);
    if (!parsed.success || parsed.data.state_key !== "") continue;
    const { type, content } = parsed.data;
    if (type === "m.room.name" && typeof content.name === "string") info.name = content.name;
    if (type === "m.room.topic" && typeof content.topic === "string") info.topic = content.topic;
    if (type === "m.room.canonical_alias" && typeof content.alias === "string") info.alias = content.alias;
  }
  return info;
}

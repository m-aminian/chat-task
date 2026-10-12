import type { EventId, RoomId, UserId } from "../matrix/ids";
import { displayOrder, type RoomTimeline } from "../timeline/merge";
import { dayKey, formatDay } from "../utils/format";
import type { AppState, RoomSummary } from "./state";

const NO_USERS: readonly UserId[] = [];

export function selectRoomOrder(state: AppState): RoomId[] {
  const { roomIds, rooms } = state;
  return [...roomIds].sort((a, b) => (rooms[b]?.lastActivity ?? 0) - (rooms[a]?.lastActivity ?? 0));
}

export const selectRoom =
  (roomId: RoomId) =>
  (state: AppState): RoomSummary | undefined =>
    state.rooms[roomId];

export const selectTyping =
  (roomId: RoomId) =>
  (state: AppState): readonly UserId[] =>
    state.typing[roomId] ?? NO_USERS;

export const selectTotalUnread = (state: AppState): number =>
  state.roomIds.reduce((sum, id) => sum + (state.rooms[id]?.unread ?? 0), 0);

export type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "event"; key: string; eventId: EventId; continuation: boolean };

const GROUP_WINDOW_MS = 5 * 60_000;
// Keyed by `order`, not the whole timeline: reactions/edits/redactions create a
// fresh timeline object but never touch order or pending, so this correctly hits
// for the common case of someone reacting to an existing message.
const rowCache = new WeakMap<EventId[], { pending: EventId[]; rows: TimelineRow[] }>();

export function selectRows(timeline: RoomTimeline | undefined): TimelineRow[] {
  if (!timeline) return [];
  const cached = rowCache.get(timeline.order);
  if (cached && cached.pending === timeline.pending) return cached.rows;

  const rows: TimelineRow[] = [];
  let lastDay = "";
  let lastSender: UserId | null = null;
  let lastTs = 0;
  for (const id of displayOrder(timeline)) {
    const item = timeline.items[id];
    if (!item) continue;
    const { ts, sender } = item.event;
    const day = dayKey(ts);
    if (day !== lastDay) {
      rows.push({ type: "day", key: `day:${day}`, label: formatDay(ts) });
      lastDay = day;
      lastSender = null;
    }
    const continuation = sender === lastSender && ts - lastTs < GROUP_WINDOW_MS;
    rows.push({ type: "event", key: id, eventId: id, continuation });
    lastSender = sender;
    lastTs = ts;
  }
  rowCache.set(timeline.order, { pending: timeline.pending, rows });
  return rows;
}

export function rowsEqual(a: readonly TimelineRow[], b: readonly TimelineRow[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.key !== y.key || x.type !== y.type) return false;
    if (
      x.type === "event" &&
      y.type === "event" &&
      (x.eventId !== y.eventId || x.continuation !== y.continuation)
    ) {
      return false;
    }
  }
  return true;
}

export function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((value, i) => value === b[i]));
}

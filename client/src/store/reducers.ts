import { isRelation, summarize, type MatrixEvent, type MessageEvent } from "../matrix/events";
import type { EventId, RoomId, TxnId, UserId } from "../matrix/ids";
import {
  addLocalEcho,
  emptyTimeline,
  linkLocalEcho,
  mergeEvents,
  prependPage,
  removeLocalEcho,
  resetTimeline,
  setLocalStatus,
  type LocalEchoInput,
  type LocalStatus,
  type RoomTimeline,
} from "../timeline/merge";
import { readRoomState } from "./roomState";
import type { AppState, Member, RoomSummary } from "./state";

export interface GapFill {
  events: MatrixEvent[];

  reset: boolean;
  prevBatch: string | null;
}

export interface RoomUpdate {
  roomId: RoomId;
  stateEvents: readonly unknown[];

  timeline: MatrixEvent[];
  prevBatch: string | null;
  gap: GapFill | null;
  unread: { notifications: number; highlights: number };
  typing: UserId[] | null;
}

function updateTimeline(existing: RoomTimeline | undefined, update: RoomUpdate): RoomTimeline {
  if (!existing) return mergeEvents(emptyTimeline(update.prevBatch), update.timeline, "append");
  if (!update.gap?.reset) return mergeEvents(existing, update.timeline, "append");
  return mergeEvents(
    resetTimeline(existing, update.gap.prevBatch),
    [...update.gap.events, ...update.timeline],
    "append",
  );
}

function latestMessage(events: readonly MatrixEvent[]): MessageEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (!isRelation(event) && event.kind !== "unknown") return event;
  }
  return null;
}

function sameUsers(a: readonly UserId[] | undefined, b: readonly UserId[]): boolean {
  return a !== undefined && a.length === b.length && a.every((u, i) => u === b[i]);
}

export function applyRoomUpdate(state: AppState, update: RoomUpdate): AppState {
  const { roomId } = update;
  const previous = state.rooms[roomId];
  const info = readRoomState(update.stateEvents);
  const latest = latestMessage(update.timeline);

  const summary: RoomSummary = {
    roomId,
    name: info.name ?? previous?.name ?? info.alias ?? roomId,
    topic: info.topic ?? previous?.topic ?? "",
    lastActivity: Math.max(previous?.lastActivity ?? 0, latest?.ts ?? 0),
    preview: latest ? { sender: latest.sender, text: summarize(latest) } : (previous?.preview ?? null),
    unread: update.unread.notifications,
    highlights: update.unread.highlights,
  };
  const summaryChanged =
    !previous ||
    previous.name !== summary.name ||
    previous.topic !== summary.topic ||
    previous.lastActivity !== summary.lastActivity ||
    previous.preview !== summary.preview ||
    previous.unread !== summary.unread ||
    previous.highlights !== summary.highlights;

  const timeline = state.timelines[roomId];
  const nextTimeline =
    update.timeline.length > 0 || update.gap || !timeline ? updateTimeline(timeline, update) : timeline;

  const typingChanged = update.typing !== null && !sameUsers(state.typing[roomId], update.typing);

  if (!summaryChanged && nextTimeline === timeline && !typingChanged) return state;
  return {
    ...state,
    roomIds: previous ? state.roomIds : [...state.roomIds, roomId],
    rooms: summaryChanged ? { ...state.rooms, [roomId]: summary } : state.rooms,
    timelines: nextTimeline === timeline ? state.timelines : { ...state.timelines, [roomId]: nextTimeline },
    typing: typingChanged ? { ...state.typing, [roomId]: update.typing! } : state.typing,
  };
}

export function applyBackPage(
  state: AppState,
  roomId: RoomId,
  from: string,
  chunk: readonly MatrixEvent[],
  end: string | null,
): AppState {
  const timeline = state.timelines[roomId];

  if (!timeline || timeline.prevBatch !== from) return state;
  return { ...state, timelines: { ...state.timelines, [roomId]: prependPage(timeline, chunk, end) } };
}

export function setPaginating(state: AppState, roomId: RoomId, value: boolean): AppState {
  if ((state.paginating[roomId] ?? false) === value) return state;
  return { ...state, paginating: { ...state.paginating, [roomId]: value } };
}

export function setMembers(state: AppState, roomId: RoomId, members: Record<UserId, Member>): AppState {
  return { ...state, members: { ...state.members, [roomId]: members } };
}

function withTimeline(state: AppState, roomId: RoomId, fn: (tl: RoomTimeline) => RoomTimeline): AppState {
  const timeline = state.timelines[roomId];
  if (!timeline) return state;
  const next = fn(timeline);
  return next === timeline ? state : { ...state, timelines: { ...state.timelines, [roomId]: next } };
}

export function addEcho(state: AppState, roomId: RoomId, txnId: TxnId, event: LocalEchoInput): AppState {
  return withTimeline(state, roomId, (tl) => addLocalEcho(tl, txnId, event));
}

export function setEchoStatus(state: AppState, roomId: RoomId, txnId: TxnId, status: LocalStatus): AppState {
  return withTimeline(state, roomId, (tl) => setLocalStatus(tl, txnId, status));
}

export function linkEcho(state: AppState, roomId: RoomId, txnId: TxnId, eventId: EventId): AppState {
  return withTimeline(state, roomId, (tl) => linkLocalEcho(tl, txnId, eventId));
}

export function removeEcho(state: AppState, roomId: RoomId, txnId: TxnId): AppState {
  return withTimeline(state, roomId, (tl) => removeLocalEcho(tl, txnId));
}

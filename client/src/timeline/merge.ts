import {
  assertNever,
  isRelation,
  type EventOfKind,
  type MatrixEvent,
  type MessageEvent,
  type RelationEvent,
} from "../matrix/events";
import { localEventId, type EventId, type TxnId, type UserId } from "../matrix/ids";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type LocalEchoInput = DistributiveOmit<EventOfKind<"text" | "reply">, "eventId" | "txnId">;

export interface EditRecord {
  eventId: EventId;
  ts: number;
  body: string;
}

export type LocalStatus = "sending" | "failed";

export interface TimelineItem {
  key: string;
  event: MessageEvent;

  edits: EditRecord[];

  reactions: Record<string, Record<UserId, EventId>>;
  redacted: boolean;
  local?: { txnId: TxnId; status: LocalStatus; eventId?: EventId };
}

interface RelationRef {
  kind: "edit" | "reaction";
  targetId: EventId;
  sender: UserId;
  key?: string;
}

export interface RoomTimeline {
  order: EventId[];

  pending: EventId[];
  items: Record<EventId, TimelineItem>;

  relations: Record<EventId, RelationRef>;

  orphans: Record<EventId, RelationEvent[]>;

  redacted: Record<EventId, true>;

  prevBatch: string | null;
}

export function emptyTimeline(prevBatch: string | null): RoomTimeline {
  return { order: [], pending: [], items: {}, relations: {}, orphans: {}, redacted: {}, prevBatch };
}

export function displayOrder(tl: RoomTimeline): EventId[] {
  return tl.pending.length === 0 ? tl.order : [...tl.order, ...tl.pending];
}

export function currentBody(item: TimelineItem): string | null {
  if (item.redacted) return null;
  const latest = item.edits[item.edits.length - 1];
  if (latest) return latest.body;
  switch (item.event.kind) {
    case "text":
    case "notice":
    case "reply":
    case "image":
      return item.event.body;
    case "redacted":
      return null;
    case "unknown":
      return "";
    default:
      return assertNever(item.event);
  }
}

class Draft {
  private cloned = new Set<keyof RoomTimeline>();
  private touchedItems = new Set<EventId>();
  next: RoomTimeline;

  constructor(base: RoomTimeline) {
    this.next = { ...base };
  }

  map<K extends "items" | "relations" | "orphans" | "redacted">(key: K): RoomTimeline[K] {
    if (!this.cloned.has(key)) {
      this.next[key] = { ...this.next[key] } as RoomTimeline[K];
      this.cloned.add(key);
    }
    return this.next[key];
  }

  item(id: EventId): TimelineItem | undefined {
    return this.next.items[id];
  }

  updateItem(id: EventId, update: (item: TimelineItem) => TimelineItem): void {
    const current = this.next.items[id];
    if (!current) return;
    const items = this.map("items");
    if (this.touchedItems.has(id)) {
      items[id] = update(current);
    } else {
      items[id] = update({ ...current });
      this.touchedItems.add(id);
    }
  }

  setItem(id: EventId, item: TimelineItem): void {
    this.map("items")[id] = item;
    this.touchedItems.add(id);
  }

  deleteItem(id: EventId): void {
    delete this.map("items")[id];
  }
}

export function mergeEvents(
  tl: RoomTimeline,
  events: readonly MatrixEvent[],
  position: "append" | "prepend",
): RoomTimeline {
  if (events.length === 0) return tl;
  const draft = new Draft(tl);
  const added: EventId[] = [];
  const addedIds = new Set<EventId>();
  const relations: RelationEvent[] = [];

  for (const event of events) {
    if (isRelation(event)) {
      relations.push(event);
      continue;
    }

    if (event.kind === "redacted" && event.type !== "m.room.message") continue;
    if (draft.item(event.eventId) || addedIds.has(event.eventId)) continue;

    const echoId =
      draft.next.pending.find((id) => {
        const local = draft.item(id)?.local;
        return local !== undefined && (local.txnId === event.txnId || local.eventId === event.eventId);
      }) ?? null;
    const echo = echoId ? draft.item(echoId) : undefined;
    if (echoId && echo) {
      draft.deleteItem(echoId);
      draft.next.pending = draft.next.pending.filter((id) => id !== echoId);
    }

    draft.setItem(event.eventId, {
      key: echo?.key ?? event.txnId ?? event.eventId,
      event,
      edits: [],
      reactions: {},
      redacted: event.kind === "redacted" || draft.next.redacted[event.eventId] === true,
    });
    added.push(event.eventId);
    addedIds.add(event.eventId);
  }

  if (added.length > 0) {
    draft.next.order =
      position === "append" ? [...draft.next.order, ...added] : [...added, ...draft.next.order];
  }

  for (const relation of relations) applyRelation(draft, relation);

  for (const id of added) {
    const waiting = draft.next.orphans[id];
    if (!waiting) continue;
    delete draft.map("orphans")[id];
    for (const relation of [...waiting].sort((a, b) => a.ts - b.ts)) applyRelation(draft, relation);
  }

  return draft.next;
}

const MAX_PENDING_TARGETS = 200;

function applyRelation(draft: Draft, relation: RelationEvent): void {
  if (draft.next.redacted[relation.eventId] || draft.next.relations[relation.eventId]) return;

  switch (relation.kind) {
    case "redaction":
      return applyRedaction(draft, relation.targetId);
    case "edit":
    case "reaction": {
      const target = draft.item(relation.targetId);
      if (!target) {
        const orphans = draft.map("orphans");
        const list = orphans[relation.targetId] ?? [];
        if (!list.some((r) => r.eventId === relation.eventId))
          orphans[relation.targetId] = [...list, relation];
        const targets = Object.keys(orphans);
        if (targets.length > MAX_PENDING_TARGETS) delete orphans[targets[0] as EventId];
        return;
      }
      if (target.redacted) return;
      if (relation.kind === "edit") applyEdit(draft, relation, target);
      else applyReaction(draft, relation);
      return;
    }
    default:
      return assertNever(relation);
  }
}

function applyEdit(draft: Draft, edit: Extract<RelationEvent, { kind: "edit" }>, target: TimelineItem): void {
  if (edit.sender !== target.event.sender) return;
  draft.map("relations")[edit.eventId] = { kind: "edit", targetId: edit.targetId, sender: edit.sender };
  draft.updateItem(edit.targetId, (item) => ({
    ...item,
    edits: [...item.edits, { eventId: edit.eventId, ts: edit.ts, body: edit.body }].sort(
      (a, b) => a.ts - b.ts,
    ),
  }));
}

function applyReaction(draft: Draft, reaction: Extract<RelationEvent, { kind: "reaction" }>): void {
  draft.map("relations")[reaction.eventId] = {
    kind: "reaction",
    targetId: reaction.targetId,
    sender: reaction.sender,
    key: reaction.key,
  };
  draft.updateItem(reaction.targetId, (item) => ({
    ...item,
    reactions: {
      ...item.reactions,
      [reaction.key]: { ...item.reactions[reaction.key], [reaction.sender]: reaction.eventId },
    },
  }));
}

function applyRedaction(draft: Draft, targetId: EventId): void {
  draft.map("redacted")[targetId] = true;

  if (draft.item(targetId)) {
    draft.updateItem(targetId, (item) => ({ ...item, redacted: true, edits: [], reactions: {} }));
    return;
  }

  const ref = draft.next.relations[targetId];
  if (ref) {
    delete draft.map("relations")[targetId];
    draft.updateItem(ref.targetId, (item) => {
      if (ref.kind === "edit") return { ...item, edits: item.edits.filter((e) => e.eventId !== targetId) };
      const key = ref.key ?? "";
      const senders = { ...item.reactions[key] };
      delete senders[ref.sender];
      const reactions = { ...item.reactions, [key]: senders };
      if (Object.keys(senders).length === 0) delete reactions[key];
      return { ...item, reactions };
    });
    return;
  }

  for (const [orphanTarget, list] of Object.entries(draft.next.orphans)) {
    if (list.some((r) => r.eventId === targetId)) {
      draft.map("orphans")[orphanTarget as EventId] = list.filter((r) => r.eventId !== targetId);
    }
  }
}

export function prependPage(
  tl: RoomTimeline,
  chunk: readonly MatrixEvent[],
  end: string | null,
): RoomTimeline {
  const merged = mergeEvents(tl, [...chunk].reverse(), "prepend");
  return { ...merged, prevBatch: end };
}

export function resetTimeline(tl: RoomTimeline, prevBatch: string | null): RoomTimeline {
  const next = emptyTimeline(prevBatch);
  for (const id of tl.pending) {
    const item = tl.items[id];
    if (item) next.items[id] = item;
  }
  next.pending = tl.pending.filter((id) => next.items[id]);
  return next;
}

export function addLocalEcho(tl: RoomTimeline, txnId: TxnId, input: LocalEchoInput): RoomTimeline {
  const id = localEventId(txnId);
  if (tl.items[id]) return tl;
  const event: MessageEvent =
    input.kind === "reply" ? { ...input, eventId: id, txnId } : { ...input, eventId: id, txnId };
  const item: TimelineItem = {
    key: txnId,
    event,
    edits: [],
    reactions: {},
    redacted: false,
    local: { txnId, status: "sending" },
  };
  return { ...tl, items: { ...tl.items, [id]: item }, pending: [...tl.pending, id] };
}

export function setLocalStatus(tl: RoomTimeline, txnId: TxnId, status: LocalStatus): RoomTimeline {
  const id = localEventId(txnId);
  const item = tl.items[id];
  if (!item?.local || item.local.status === status) return tl;
  return { ...tl, items: { ...tl.items, [id]: { ...item, local: { ...item.local, status } } } };
}

export function linkLocalEcho(tl: RoomTimeline, txnId: TxnId, eventId: EventId): RoomTimeline {
  const id = localEventId(txnId);
  const echo = tl.items[id];
  if (!echo?.local) return tl;
  return { ...tl, items: { ...tl.items, [id]: { ...echo, local: { ...echo.local, eventId } } } };
}

export function removeLocalEcho(tl: RoomTimeline, txnId: TxnId): RoomTimeline {
  const id = localEventId(txnId);
  if (!tl.items[id]) return tl;
  const items = { ...tl.items };
  delete items[id];
  return { ...tl, items, pending: tl.pending.filter((p) => p !== id) };
}

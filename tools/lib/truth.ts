import type { MatrixClient } from "./matrix.js";

interface RawEvent {
  event_id: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  redacts?: string;
  unsigned?: { redacted_because?: unknown };
}

const TYPES = new Set(["m.room.message", "m.reaction", "m.room.redaction"]);

export interface TruthRow {
  eventId: string;

  body: string | null;

  malformed: boolean;
}

const TEXT_TYPES = new Set(["m.text", "m.emote", "m.notice"]);

function isWellFormed(content: Record<string, unknown>): boolean {
  if (typeof content.body !== "string" || typeof content.msgtype !== "string") return false;
  if (TEXT_TYPES.has(content.msgtype)) return true;
  if (content.msgtype === "m.image") return typeof content.url === "string";
  return false;
}

export interface History {
  events: RawEvent[];

  complete: boolean;
}

export async function fetchHistory(
  admin: MatrixClient,
  roomId: string,
  opts: { newerThan?: string; until?: string } = {},
): Promise<History> {
  const events: RawEvent[] = [];
  let from: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ dir: "b", limit: "1000" });
    if (from) query.set("from", from);
    const page = await admin.request<{ chunk: RawEvent[]; end?: string }>(
      "GET",
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/messages?${query}`,
    );
    const before = opts.newerThan ? page.chunk.findIndex((e) => e.event_id === opts.newerThan) : -1;
    const at = opts.until ? page.chunk.findIndex((e) => e.event_id === opts.until) : -1;
    if (before >= 0) {
      events.push(...page.chunk.slice(0, before));
      return { events: events.reverse().filter((e) => TYPES.has(e.type)), complete: false };
    }
    if (at >= 0) {
      events.push(...page.chunk.slice(0, at + 1));
      const olderOnPage = page.chunk.slice(at + 1).some((e) => e.type === "m.room.message");
      const complete = !olderOnPage && (!page.end || (await isStart(admin, roomId, page.end)));
      return { events: events.reverse().filter((e) => TYPES.has(e.type)), complete };
    }
    events.push(...page.chunk);
    if (!page.end || page.chunk.length === 0) {
      return { events: events.reverse().filter((e) => TYPES.has(e.type)), complete: true };
    }
    from = page.end;
  }
}

async function isStart(admin: MatrixClient, roomId: string, token: string): Promise<boolean> {
  const query = new URLSearchParams({ dir: "b", limit: "50", from: token });
  const page = await admin.request<{ chunk: RawEvent[] }>(
    "GET",
    `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/messages?${query}`,
  );
  return !page.chunk.some((e) => e.type === "m.room.message");
}

export function extendHistory(history: RawEvent[], newer: RawEvent[]): RawEvent[] {
  const known = new Set(history.map((e) => e.event_id));
  return [...history, ...newer.filter((e) => !known.has(e.event_id))];
}

export type { RawEvent };

const relation = (e: RawEvent) =>
  e.content["m.relates_to"] as { rel_type?: string; event_id?: string } | undefined;

export function expectedRows(history: RawEvent[]): TruthRow[] {
  const redacted = new Set<string>();
  for (const e of history) {
    if (e.unsigned?.redacted_because !== undefined) redacted.add(e.event_id);
    if (e.type === "m.room.redaction") {
      const target = e.redacts ?? (e.content.redacts as string | undefined);
      if (target) redacted.add(target);
    }
  }

  const rows: TruthRow[] = [];
  const index = new Map<string, { row: TruthRow; sender: string }>();
  for (const e of history) {
    if (e.type !== "m.room.message") continue;
    const rel = relation(e);
    if (rel?.rel_type === "m.replace" && rel.event_id) {
      const target = index.get(rel.event_id);
      const newContent = e.content["m.new_content"] as { body?: unknown } | undefined;
      if (target && target.sender === e.sender && !redacted.has(e.event_id) && target.row.body !== null) {
        if (typeof newContent?.body === "string") target.row.body = newContent.body;
      }
      continue;
    }
    const wellFormed = isWellFormed(e.content);
    const row: TruthRow = {
      eventId: e.event_id,
      body: redacted.has(e.event_id) ? null : typeof e.content.body === "string" ? e.content.body : "",
      malformed: !wellFormed,
    };
    rows.push(row);
    index.set(e.event_id, { row, sender: e.sender });
  }
  return rows;
}

export interface ClientTimeline {
  order: string[];
  bodies: Record<string, string | null>;
}

export interface Comparison {
  expected: number;

  loaded: number;

  fullHistory: boolean;
  duplicates: { eventId: string; count: number }[];
  missing: { eventId: string; body: string | null }[];
  unexpected: string[];
  wrongEdit: { eventId: string; expected: string | null; actual: string | null }[];
  redactedWithContent: { eventId: string; actual: string }[];

  localEchoes: { id: string; body: string | null }[];
}

export function compare(
  before: TruthRow[],
  client: ClientTimeline,
  after: TruthRow[] = before,
  truthComplete = true,
): Comparison {
  const confirmed = client.order.filter((id) => !id.startsWith("~"));
  const seen = new Map<string, number>();
  for (const id of confirmed) seen.set(id, (seen.get(id) ?? 0) + 1);

  const beforeIndex = new Map(before.map((row, i) => [row.eventId, i]));
  const afterIndex = new Map(after.map((row) => [row.eventId, row]));
  const oldestLoaded = Math.min(...confirmed.map((id) => beforeIndex.get(id) ?? Infinity));
  const range = Number.isFinite(oldestLoaded) ? before.slice(oldestLoaded) : before;

  const result: Comparison = {
    expected: range.length,
    loaded: confirmed.length,
    fullHistory: truthComplete && oldestLoaded === 0,
    duplicates: [...seen].filter(([, n]) => n > 1).map(([eventId, count]) => ({ eventId, count })),
    missing: range.filter((row) => !seen.has(row.eventId)).map(({ eventId, body }) => ({ eventId, body })),
    unexpected: confirmed.filter((id) => !afterIndex.has(id)),
    wrongEdit: [],
    redactedWithContent: [],
    localEchoes: client.order
      .filter((id) => id.startsWith("~"))
      .map((id) => ({ id, body: client.bodies[id] ?? null })),
  };

  for (const row of range) {
    if (!seen.has(row.eventId)) continue;
    const actual = client.bodies[row.eventId] ?? null;
    const later = afterIndex.get(row.eventId) ?? row;
    if (row.body === null) {
      if (actual !== null && actual !== "") result.redactedWithContent.push({ eventId: row.eventId, actual });
      continue;
    }
    const acceptable = (expected: TruthRow) =>
      actual === expected.body ||
      (expected.malformed && actual === "") ||
      (expected.body === null && actual === null);
    if (!acceptable(row) && !acceptable(later)) {
      result.wrongEdit.push({ eventId: row.eventId, expected: later.body, actual });
    }
  }
  return result;
}

export function issueCount(c: Comparison): number {
  return (
    c.duplicates.length +
    c.missing.length +
    c.unexpected.length +
    c.wrongEdit.length +
    c.redactedWithContent.length
  );
}

export function isClean(c: Comparison): boolean {
  return issueCount(c) === 0;
}

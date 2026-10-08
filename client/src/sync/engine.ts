import { z } from "zod";
import { MatrixApiError, type JoinedRoomSync, type MatrixApi, type SyncResponse } from "../matrix/api";
import { isRelation, parseEvent, type MatrixEvent, type MessageEvent } from "../matrix/events";
import { isRoomId, userIdSchema, type RoomId, type UserId } from "../matrix/ids";
import { applyRoomUpdate, type GapFill } from "../store/reducers";
import type { AppState, SyncStatus } from "../store/state";
import type { Store } from "../store/store";
import type { RoomTimeline } from "../timeline/merge";
import { Backoff } from "../utils/backoff";
import { MESSAGES_FILTER, SYNC_FILTER } from "./filter";

const LONG_POLL_MS = 30_000;

const REQUEST_DEADLINE_MS = LONG_POLL_MS + 15_000;

const PROCESS_DEADLINE_MS = 60_000;
const GAP_PAGE_SIZE = 100;
const MAX_GAP_PAGES = 5;

const GAP_OVERLAP = 20;

export type LiveEventsListener = (roomId: RoomId, events: readonly MessageEvent[]) => void;

const typingSchema = z.object({
  type: z.literal("m.typing"),
  content: z.object({ user_ids: z.array(userIdSchema) }),
});

function readTyping(room: JoinedRoomSync): UserId[] | null {
  for (const raw of room.ephemeral.events) {
    const parsed = typingSchema.safeParse(raw);
    if (parsed.success) return parsed.data.content.user_ids;
  }
  return null;
}

function parseAll(raw: readonly unknown[]): MatrixEvent[] {
  const events: MatrixEvent[] = [];
  for (const item of raw) {
    const event = parseEvent(item);
    if (event) events.push(event);
  }
  return events;
}

function describe(err: unknown): string {
  if (err instanceof MatrixApiError) return `${err.errcode}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export class SyncEngine {
  private since: string | null = null;
  private running = false;

  private generation = 0;
  private controller: AbortController | null = null;
  private wake: (() => void) | null = null;
  private readonly backoff = new Backoff({ baseMs: 1_000, maxMs: 30_000, jitter: 0.3 });
  private readonly listeners = new Set<LiveEventsListener>();

  onAuthError: (() => void) | null = null;

  constructor(
    private readonly api: MatrixApi,
    private readonly store: Store<AppState>,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener("online", this.handleOnline);
    void this.run(++this.generation);
  }

  stop(): void {
    this.running = false;
    window.removeEventListener("online", this.handleOnline);
    this.controller?.abort();
    this.wake?.();
    this.setStatus("stopped", null);
  }

  onLiveEvents(listener: LiveEventsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly handleOnline = () => {
    this.backoff.reset();
    this.wake?.();
  };

  private setStatus(status: SyncStatus, error: string | null): void {
    this.store.setState((s) =>
      s.syncStatus === status && s.syncError === error ? s : { ...s, syncStatus: status, syncError: error },
    );
  }

  private async run(generation: number): Promise<void> {
    const active = () => this.running && generation === this.generation;
    this.setStatus(this.since ? "live" : "initial", null);
    while (active()) {
      const controller = new AbortController();
      this.controller = controller;
      let deadline = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
      try {
        const response = await this.api.sync({
          since: this.since ?? undefined,
          timeout: this.since ? LONG_POLL_MS : 0,
          filter: SYNC_FILTER,
          signal: controller.signal,
        });
        if (!active()) break;

        clearTimeout(deadline);
        deadline = setTimeout(() => controller.abort(), PROCESS_DEADLINE_MS);
        await this.process(response, controller.signal);
        this.since = response.next_batch;
        this.backoff.reset();
        this.setStatus("live", null);
      } catch (err) {
        if (!active()) break;
        if (err instanceof MatrixApiError && err.isAuthError) {
          this.running = false;
          this.onAuthError?.();
          break;
        }
        this.setStatus("reconnecting", describe(err));
        const delay =
          err instanceof MatrixApiError && err.retryAfterMs ? err.retryAfterMs : this.backoff.next();
        await this.sleep(delay);
      } finally {
        clearTimeout(deadline);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }

  private async process(response: SyncResponse, signal: AbortSignal): Promise<void> {
    const initial = this.since === null;
    for (const [id, room] of Object.entries(response.rooms.join)) {
      if (!isRoomId(id)) continue;
      const roomId = id;
      const timeline = parseAll(room.timeline.events);
      const prevBatch = room.timeline.prev_batch ?? null;
      const existing = this.store.getState().timelines[roomId];

      let gap: GapFill | null = null;
      if (room.timeline.limited && existing && prevBatch) {
        gap = await this.fillGap(roomId, existing, prevBatch, signal);
      }

      this.store.setState((s) =>
        applyRoomUpdate(s, {
          roomId,
          stateEvents: room.state.events,
          timeline,
          prevBatch,
          gap,
          unread: {
            notifications: room.unread_notifications.notification_count,
            highlights: room.unread_notifications.highlight_count,
          },
          typing: readTyping(room),
        }),
      );

      if (!initial) {
        const messages = timeline.filter((e): e is MessageEvent => !isRelation(e));
        if (messages.length > 0) for (const listener of [...this.listeners]) listener(roomId, messages);
      }
    }
  }

  private async fillGap(
    roomId: RoomId,
    existing: RoomTimeline,
    from: string,
    signal: AbortSignal,
  ): Promise<GapFill> {
    const needed = Math.min(GAP_OVERLAP, existing.order.length);
    const collected: MatrixEvent[] = [];
    let knownRun = 0;
    let token = from;

    for (let page = 0; page < MAX_GAP_PAGES; page++) {
      const res = await this.api.messages(roomId, {
        from: token,
        dir: "b",
        limit: GAP_PAGE_SIZE,
        filter: MESSAGES_FILTER,
        signal,
      });
      for (const event of parseAll(res.chunk)) {
        const message = !isRelation(event);
        if (existing.items[event.eventId] || existing.relations[event.eventId]) {
          if (message) knownRun++;
          if (needed > 0 && knownRun >= needed) {
            return { events: collected.reverse(), reset: false, prevBatch: existing.prevBatch };
          }
          continue;
        }
        if (message) knownRun = 0;
        collected.push(event);
      }
      if (!res.end || res.chunk.length === 0) {
        return { events: collected.reverse(), reset: false, prevBatch: existing.prevBatch };
      }
      token = res.end;
    }
    return { events: collected.reverse(), reset: true, prevBatch: token };
  }
}

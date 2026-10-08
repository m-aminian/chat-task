import { MatrixApiError, type MatrixApi } from "../matrix/api";
import { newTxnId, type EventId, type RoomId, type TxnId, type UserId } from "../matrix/ids";
import { addEcho, linkEcho, removeEcho, setEchoStatus } from "../store/reducers";
import type { AppState } from "../store/state";
import type { Store } from "../store/store";
import { Backoff } from "../utils/backoff";

const SEND_TIMEOUT_MS = 15_000;

interface Entry {
  roomId: RoomId;
  txnId: TxnId;
  content: Record<string, unknown>;
  attempts: number;
  state: "queued" | "sending" | "failed";
}

export interface SendQueueOptions {
  maxAttempts: number;
  backoff: Backoff;
  sleep: (ms: number) => Promise<void>;
}

const defaults: SendQueueOptions = {
  maxAttempts: 3,
  backoff: new Backoff({ baseMs: 500, maxMs: 8_000, jitter: 0.2 }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function isRetryable(err: unknown): boolean {
  if (err instanceof MatrixApiError) return err.status === 429 || err.status >= 500;

  return err instanceof Error;
}

export class SendQueue {
  private readonly entries = new Map<TxnId, Entry>();
  private readonly pumping = new Set<RoomId>();
  private readonly options: SendQueueOptions;

  constructor(
    private readonly api: MatrixApi,
    private readonly store: Store<AppState>,
    private readonly userId: UserId,
    options: Partial<SendQueueOptions> = {},
  ) {
    this.options = { ...defaults, ...options };
  }

  sendText(roomId: RoomId, body: string, replyTo?: EventId): TxnId {
    const txnId = newTxnId();
    const ts = Date.now();
    const content: Record<string, unknown> = { msgtype: "m.text", body };
    if (replyTo) content["m.relates_to"] = { "m.in_reply_to": { event_id: replyTo } };

    this.store.setState((s) =>
      addEcho(
        s,
        roomId,
        txnId,
        replyTo
          ? { kind: "reply", sender: this.userId, ts, body, inReplyTo: replyTo }
          : { kind: "text", sender: this.userId, ts, body, emote: false },
      ),
    );
    this.entries.set(txnId, { roomId, txnId, content, attempts: 0, state: "queued" });
    void this.pump(roomId);
    return txnId;
  }

  retry(txnId: TxnId): void {
    const entry = this.entries.get(txnId);
    if (!entry || entry.state !== "failed") return;
    entry.state = "queued";
    entry.attempts = 0;
    this.store.setState((s) => setEchoStatus(s, entry.roomId, txnId, "sending"));
    void this.pump(entry.roomId);
  }

  cancel(txnId: TxnId): void {
    const entry = this.entries.get(txnId);
    if (!entry || entry.state === "sending") return;
    this.entries.delete(txnId);
    this.store.setState((s) => removeEcho(s, entry.roomId, txnId));
  }

  pendingCount(roomId: RoomId): number {
    let count = 0;
    for (const entry of this.entries.values())
      if (entry.roomId === roomId && entry.state !== "failed") count++;
    return count;
  }

  private nextQueued(roomId: RoomId): Entry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.roomId === roomId && entry.state === "queued") return entry;
    }
    return undefined;
  }

  private async pump(roomId: RoomId): Promise<void> {
    if (this.pumping.has(roomId)) return;
    this.pumping.add(roomId);
    try {
      for (let entry = this.nextQueued(roomId); entry; entry = this.nextQueued(roomId)) {
        await this.attempt(entry);
      }
    } finally {
      this.pumping.delete(roomId);
    }
  }

  private async attempt(entry: Entry): Promise<void> {
    entry.state = "sending";
    try {
      const eventId = await this.api.send(
        entry.roomId,
        "m.room.message",
        entry.content,
        AbortSignal.timeout(SEND_TIMEOUT_MS),
      );
      this.entries.delete(entry.txnId);
      this.options.backoff.reset();
      this.store.setState((s) => linkEcho(s, entry.roomId, entry.txnId, eventId));
    } catch (err) {
      entry.attempts++;
      if (isRetryable(err) && entry.attempts < this.options.maxAttempts) {
        entry.state = "queued";
        const hinted = err instanceof MatrixApiError ? err.retryAfterMs : undefined;
        await this.options.sleep(hinted ?? this.options.backoff.next());
        return;
      }
      entry.state = "failed";
      this.store.setState((s) => setEchoStatus(s, entry.roomId, entry.txnId, "failed"));
    }
  }

  async edit(roomId: RoomId, targetId: EventId, body: string): Promise<void> {
    await this.api.send(roomId, "m.room.message", {
      msgtype: "m.text",
      body: `* ${body}`,
      "m.new_content": { msgtype: "m.text", body },
      "m.relates_to": { rel_type: "m.replace", event_id: targetId },
    });
  }

  async react(roomId: RoomId, targetId: EventId, key: string): Promise<void> {
    await this.api.send(roomId, "m.reaction", {
      "m.relates_to": { rel_type: "m.annotation", event_id: targetId, key },
    });
  }

  async redact(roomId: RoomId, eventId: EventId): Promise<void> {
    await this.api.redact(roomId, eventId, newTxnId());
  }
}

import { z } from "zod";
import type { EventId, RoomId, TxnId, UserId } from "./ids";
import { eventIdSchema, userIdSchema } from "./ids";

export class MatrixApiError extends Error {
  constructor(
    readonly status: number,
    readonly errcode: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "MatrixApiError";
  }

  get isAuthError(): boolean {
    return this.errcode === "M_UNKNOWN_TOKEN" || this.errcode === "M_MISSING_TOKEN";
  }
}

export interface Session {
  homeserver: string;
  userId: UserId;
  accessToken: string;
  deviceId: string;
}

const eventList = z.object({ events: z.array(z.unknown()).default([]) }).default({});

const joinedRoomSchema = z.object({
  timeline: z
    .object({
      events: z.array(z.unknown()).default([]),
      limited: z.boolean().default(false),
      prev_batch: z.string().optional(),
    })
    .default({}),
  state: eventList,
  ephemeral: eventList,
  account_data: eventList,
  unread_notifications: z
    .object({
      notification_count: z.number().default(0),
      highlight_count: z.number().default(0),
    })
    .default({}),
});
export type JoinedRoomSync = z.infer<typeof joinedRoomSchema>;

const syncResponseSchema = z.object({
  next_batch: z.string(),
  rooms: z
    .object({
      join: z.record(z.string(), joinedRoomSchema).default({}),
      leave: z.record(z.string(), z.unknown()).default({}),
    })
    .default({}),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

const messagesResponseSchema = z.object({
  chunk: z.array(z.unknown()),
  start: z.string(),
  end: z.string().optional(),
});
export type MessagesResponse = z.infer<typeof messagesResponseSchema>;

const contextResponseSchema = z.object({
  event: z.unknown(),
  events_before: z.array(z.unknown()).default([]),
  events_after: z.array(z.unknown()).default([]),
  start: z.string().optional(),
  end: z.string().optional(),
});
export type ContextResponse = z.infer<typeof contextResponseSchema>;

const searchResponseSchema = z.object({
  search_categories: z.object({
    room_events: z
      .object({
        count: z.number().optional(),
        results: z.array(z.object({ rank: z.number().optional(), result: z.unknown() })).default([]),
      })
      .default({}),
  }),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

const loginResponseSchema = z.object({
  user_id: userIdSchema,
  access_token: z.string(),
  device_id: z.string(),
});

const membersResponseSchema = z.object({
  joined: z.record(
    z.string(),
    z.object({
      display_name: z.string().nullish(),
      avatar_url: z.string().nullish(),
    }),
  ),
});
export type JoinedMembers = z.infer<typeof membersResponseSchema>["joined"];

interface RequestOptions<T> {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

const enc = encodeURIComponent;
const okSchema = z.unknown();

async function request<T>(
  baseUrl: string,
  accessToken: string | null,
  method: string,
  path: string,
  { query, body, signal, schema }: RequestOptions<T>,
): Promise<T> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = z
      .object({
        errcode: z.string().default("M_UNKNOWN"),
        error: z.string().default(res.statusText),
        retry_after_ms: z.number().optional(),
      })
      .catch({ errcode: "M_UNKNOWN", error: res.statusText })
      .parse(json);
    throw new MatrixApiError(res.status, err.errcode, err.error, err.retry_after_ms);
  }
  return schema.parse(json);
}

export async function login(homeserver: string, username: string, password: string): Promise<Session> {
  const baseUrl = homeserver.replace(/\/+$/, "");
  const res = await request(baseUrl, null, "POST", "/_matrix/client/v3/login", {
    body: {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: username },
      password,
      initial_device_display_name: "Web client",
    },
    schema: loginResponseSchema,
  });
  return { homeserver: baseUrl, userId: res.user_id, accessToken: res.access_token, deviceId: res.device_id };
}

export class MatrixApi {
  constructor(readonly session: Session) {}

  private call<T>(method: string, path: string, opts: RequestOptions<T>): Promise<T> {
    return request(this.session.homeserver, this.session.accessToken, method, path, opts);
  }

  sync(opts: {
    since?: string;
    timeout: number;
    filter: string;
    signal?: AbortSignal;
  }): Promise<SyncResponse> {
    return this.call("GET", "/_matrix/client/v3/sync", {
      query: { since: opts.since, timeout: opts.timeout, filter: opts.filter },
      signal: opts.signal,
      schema: syncResponseSchema,
    });
  }

  messages(
    roomId: RoomId,
    opts: { from?: string; dir: "b" | "f"; limit: number; filter?: string; signal?: AbortSignal },
  ): Promise<MessagesResponse> {
    return this.call("GET", `/_matrix/client/v3/rooms/${enc(roomId)}/messages`, {
      query: { from: opts.from, dir: opts.dir, limit: opts.limit, filter: opts.filter },
      signal: opts.signal,
      schema: messagesResponseSchema,
    });
  }

  context(
    roomId: RoomId,
    eventId: EventId,
    opts: { limit: number; signal?: AbortSignal },
  ): Promise<ContextResponse> {
    return this.call("GET", `/_matrix/client/v3/rooms/${enc(roomId)}/context/${enc(eventId)}`, {
      query: { limit: opts.limit },
      signal: opts.signal,
      schema: contextResponseSchema,
    });
  }

  search(
    roomId: RoomId,
    term: string,
    opts: { limit: number; signal?: AbortSignal },
  ): Promise<SearchResponse> {
    return this.call("POST", "/_matrix/client/v3/search", {
      body: {
        search_categories: {
          room_events: {
            search_term: term,
            keys: ["content.body"],
            order_by: "recent",
            filter: { rooms: [roomId], limit: opts.limit },
          },
        },
      },
      signal: opts.signal,
      schema: searchResponseSchema,
    });
  }

  async send(roomId: RoomId, type: string, content: object, txnId: TxnId, signal?: AbortSignal): Promise<EventId> {
    const res = await this.call(
      "PUT",
      `/_matrix/client/v3/rooms/${enc(roomId)}/send/${enc(type)}/${enc(txnId)}`,
      {
        body: content,
        signal,
        schema: z.object({ event_id: eventIdSchema }),
      },
    );
    return res.event_id;
  }

  async redact(roomId: RoomId, eventId: EventId, txnId: TxnId): Promise<void> {
    await this.call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/redact/${enc(eventId)}/${enc(txnId)}`, {
      body: {},
      schema: okSchema,
    });
  }

  async sendReadReceipt(roomId: RoomId, eventId: EventId): Promise<void> {
    await this.call("POST", `/_matrix/client/v3/rooms/${enc(roomId)}/receipt/m.read/${enc(eventId)}`, {
      body: {},
      schema: okSchema,
    });
  }

  async setTyping(roomId: RoomId, typing: boolean, timeoutMs: number): Promise<void> {
    await this.call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/typing/${enc(this.session.userId)}`, {
      body: typing ? { typing, timeout: timeoutMs } : { typing },
      schema: okSchema,
    });
  }

  joinedMembers(roomId: RoomId, signal?: AbortSignal): Promise<JoinedMembers> {
    return this.call("GET", `/_matrix/client/v3/rooms/${enc(roomId)}/joined_members`, {
      signal,
      schema: membersResponseSchema,
    }).then((res) => res.joined);
  }

  async getDisplayName(userId: UserId): Promise<string | null> {
    const res = await this.call("GET", `/_matrix/client/v3/profile/${enc(userId)}/displayname`, {
      schema: z.object({ displayname: z.string().nullish() }),
    }).catch((err: unknown) => {
      if (err instanceof MatrixApiError && err.status === 404) return { displayname: null };
      throw err;
    });
    return res.displayname ?? null;
  }

  async setDisplayName(displayName: string): Promise<void> {
    await this.call("PUT", `/_matrix/client/v3/profile/${enc(this.session.userId)}/displayname`, {
      body: { displayname: displayName },
      schema: okSchema,
    });
  }

  async logout(): Promise<void> {
    await this.call("POST", "/_matrix/client/v3/logout", { body: {}, schema: okSchema });
  }
}

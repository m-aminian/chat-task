import { HOMESERVER, PASSWORD } from "./config.js";
import { sleep } from "./pool.js";

export class MatrixError extends Error {
  constructor(
    readonly status: number,
    readonly errcode: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

const enc = encodeURIComponent;
const MAX_ATTEMPTS = 6;

export class MatrixClient {
  constructor(
    readonly userId: string,
    readonly accessToken: string,
    readonly baseUrl = HOMESERVER,
  ) {}

  static async login(username: string, deviceId: string): Promise<MatrixClient> {
    const res = await fetch(`${HOMESERVER}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: username },
        password: PASSWORD,
        device_id: deviceId,
        initial_device_display_name: `assignment ${deviceId}`,
      }),
    });
    const body = (await res.json()) as { user_id: string; access_token: string; errcode?: string };
    if (!res.ok)
      throw new MatrixError(res.status, body.errcode, `login ${username}: ${JSON.stringify(body)}`);
    return new MatrixClient(body.user_id, body.access_token);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { raw?: BodyInit; contentType?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          signal: opts.signal,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...(opts.raw !== undefined || body !== undefined
              ? { "Content-Type": opts.contentType ?? "application/json" }
              : {}),
          },
          body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        });
      } catch (err) {
        if (opts.signal?.aborted || attempt >= MAX_ATTEMPTS) throw err;
        await sleep(250 * 2 ** attempt);
        continue;
      }

      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (res.ok) return json as T;

      const errcode = typeof json.errcode === "string" ? json.errcode : undefined;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        const hinted = typeof json.retry_after_ms === "number" ? json.retry_after_ms : 0;
        await sleep(Math.max(hinted, 250 * 2 ** attempt));
        continue;
      }
      throw new MatrixError(res.status, errcode, `${method} ${path} -> ${res.status} ${text}`);
    }
  }

  async createRoom(opts: { alias: string; name: string; topic: string }): Promise<string> {
    const { room_id } = await this.request<{ room_id: string }>("POST", "/_matrix/client/v3/createRoom", {
      preset: "public_chat",
      visibility: "public",
      room_alias_name: opts.alias,
      name: opts.name,
      topic: opts.topic,
    });
    return room_id;
  }

  async resolveAlias(alias: string): Promise<string | null> {
    try {
      const { room_id } = await this.request<{ room_id: string }>(
        "GET",
        `/_matrix/client/v3/directory/room/${enc(alias)}`,
      );
      return room_id;
    } catch (err) {
      if (err instanceof MatrixError && err.status === 404) return null;
      throw err;
    }
  }

  async join(roomIdOrAlias: string): Promise<string> {
    const { room_id } = await this.request<{ room_id: string }>(
      "POST",
      `/_matrix/client/v3/join/${enc(roomIdOrAlias)}`,
      {},
    );
    return room_id;
  }

  async send(roomId: string, type: string, content: unknown, txnId: string): Promise<string> {
    const { event_id } = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${enc(roomId)}/send/${enc(type)}/${enc(txnId)}`,
      content,
    );
    return event_id;
  }

  async redact(roomId: string, eventId: string, txnId: string, reason?: string): Promise<string> {
    const { event_id } = await this.request<{ event_id: string }>(
      "PUT",
      `/_matrix/client/v3/rooms/${enc(roomId)}/redact/${enc(eventId)}/${enc(txnId)}`,
      reason ? { reason } : {},
    );
    return event_id;
  }

  async getState<T>(roomId: string, type: string, stateKey = ""): Promise<T | null> {
    try {
      return await this.request<T>(
        "GET",
        `/_matrix/client/v3/rooms/${enc(roomId)}/state/${enc(type)}/${enc(stateKey)}`,
      );
    } catch (err) {
      if (err instanceof MatrixError && err.status === 404) return null;
      throw err;
    }
  }

  async setState(roomId: string, type: string, content: unknown, stateKey = ""): Promise<void> {
    await this.request(
      "PUT",
      `/_matrix/client/v3/rooms/${enc(roomId)}/state/${enc(type)}/${enc(stateKey)}`,
      content,
    );
  }

  async upload(data: Uint8Array, filename: string, contentType: string): Promise<string> {
    const { content_uri } = await this.request<{ content_uri: string }>(
      "POST",
      `/_matrix/media/v3/upload?filename=${enc(filename)}`,
      undefined,
      { raw: new Blob([new Uint8Array(data)]), contentType },
    );
    return content_uri;
  }

  async sendReceipt(roomId: string, eventId: string): Promise<void> {
    await this.request("POST", `/_matrix/client/v3/rooms/${enc(roomId)}/receipt/m.read/${enc(eventId)}`, {});
  }

  async setTyping(roomId: string, typing: boolean, timeoutMs = 4000): Promise<void> {
    await this.request("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/typing/${enc(this.userId)}`, {
      typing,
      ...(typing ? { timeout: timeoutMs } : {}),
    });
  }
}

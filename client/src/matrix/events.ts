import { z } from "zod";
import type { EventId, TxnId, UserId } from "./ids";

export interface EventBase {
  eventId: EventId;
  sender: UserId;
  ts: number;

  txnId?: TxnId;
}

export interface ImageInfo {
  mimetype?: string;
  size?: number;
  w?: number;
  h?: number;
}

export type MatrixEvent =
  | (EventBase & { kind: "text"; body: string; emote: boolean })
  | (EventBase & { kind: "notice"; body: string })
  | (EventBase & { kind: "reply"; body: string; inReplyTo: EventId })
  | (EventBase & { kind: "image"; body: string; url: string; info: ImageInfo })
  | (EventBase & { kind: "edit"; targetId: EventId; body: string })
  | (EventBase & { kind: "reaction"; targetId: EventId; key: string })
  | (EventBase & { kind: "redaction"; targetId: EventId })
  | (EventBase & { kind: "redacted"; type: string })
  | (EventBase & { kind: "unknown"; type: string; reason: "unsupported" | "invalid" });

export type EventKind = MatrixEvent["kind"];
export type EventOfKind<K extends EventKind> = Extract<MatrixEvent, { kind: K }>;

export type MessageEvent = EventOfKind<"text" | "notice" | "reply" | "image" | "redacted" | "unknown">;

export type RelationEvent = EventOfKind<"edit" | "reaction" | "redaction">;

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

export function isRelation(event: MatrixEvent): event is RelationEvent {
  switch (event.kind) {
    case "edit":
    case "reaction":
    case "redaction":
      return true;
    case "text":
    case "notice":
    case "reply":
    case "image":
    case "redacted":
    case "unknown":
      return false;
    default:
      return assertNever(event);
  }
}

export function parseEvent(raw: any): MatrixEvent | null {
  if (!raw?.event_id || !raw.sender) return null;
  const base: EventBase = {
    eventId: raw.event_id,
    sender: raw.sender,
    ts: raw.origin_server_ts,
    ...(raw.unsigned?.transaction_id ? { txnId: raw.unsigned.transaction_id } : {}),
  };

  if (raw.unsigned?.redacted_because !== undefined && raw.type !== "m.room.redaction") {
    return { ...base, kind: "redacted", type: raw.type };
  }

  const content = raw.content ?? {};
  switch (raw.type) {
    case "m.room.message":
      return parseMessage(base, content);
    case "m.reaction": {
      const rel = content["m.relates_to"];
      if (!rel?.event_id) return { ...base, kind: "unknown", type: raw.type, reason: "invalid" };
      return { ...base, kind: "reaction", targetId: rel.event_id, key: rel.key };
    }
    case "m.room.redaction": {
      const targetId = raw.redacts ?? content.redacts;
      if (!targetId) return { ...base, kind: "unknown", type: raw.type, reason: "invalid" };
      return { ...base, kind: "redaction", targetId };
    }
    default:
      return { ...base, kind: "unknown", type: raw.type, reason: "unsupported" };
  }
}

const textContentSchema = z.object({ body: z.string() });
const imageEssentialsSchema = z.object({ body: z.string(), url: z.string() });
const imageInfoSchema = z.object({
  mimetype: z.string().optional(),
  size: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
});

function parseMessage(base: EventBase, content: any): MatrixEvent | null {
  const relatesTo = content["m.relates_to"];
  if (relatesTo?.rel_type === "m.replace") {
    const newBody = content["m.new_content"]?.body;
    if (typeof newBody !== "string") return null;
    return { ...base, kind: "edit", targetId: relatesTo.event_id, body: newBody };
  }
  switch (content.msgtype) {
    case "m.image": {
      const essentials = imageEssentialsSchema.safeParse(content);
      if (!essentials.success) return { ...base, kind: "unknown", type: "m.room.message", reason: "invalid" };
      const info = imageInfoSchema.safeParse(content.info);
      return {
        ...base,
        kind: "image",
        body: essentials.data.body,
        url: essentials.data.url,
        info: info.success ? info.data : {},
      };
    }
    case "m.notice": {
      const parsed = textContentSchema.safeParse(content);
      if (!parsed.success) return { ...base, kind: "unknown", type: "m.room.message", reason: "invalid" };
      return { ...base, kind: "notice", body: parsed.data.body };
    }
    case "m.text":
    case "m.emote": {
      const parsed = textContentSchema.safeParse(content);
      if (!parsed.success) return { ...base, kind: "unknown", type: "m.room.message", reason: "invalid" };
      const replyTo = relatesTo?.["m.in_reply_to"]?.event_id;
      if (typeof replyTo === "string") return { ...base, kind: "reply", body: parsed.data.body, inReplyTo: replyTo };
      return { ...base, kind: "text", body: parsed.data.body, emote: content.msgtype === "m.emote" };
    }
    default:
      return { ...base, kind: "unknown", type: "m.room.message", reason: "unsupported" };
  }
}

export function summarize(event: MessageEvent): string {
  switch (event.kind) {
    case "text":
      return event.emote ? `* ${event.body}` : event.body;
    case "notice":
    case "reply":
      return event.body;
    case "image":
      return "Sent an image";
    case "redacted":
      return "Message deleted";
    case "unknown":
      return "Unsupported message";
    default:
      return assertNever(event);
  }
}

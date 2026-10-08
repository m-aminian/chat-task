import type { MatrixClient } from "../lib/matrix.js";

interface TimelineEvent {
  event_id: string;
  type: string;
  sender: string;
  content: { msgtype?: string; "m.relates_to"?: { rel_type?: string } };
}

const notifies = (ev: TimelineEvent, reader: string) =>
  ev.type === "m.room.message" &&
  ev.sender !== reader &&
  ev.content.msgtype !== "m.notice" &&
  ev.content["m.relates_to"]?.rel_type !== "m.replace";

export async function receiptTarget(
  reader: MatrixClient,
  roomId: string,
  unread: number,
): Promise<string | undefined> {
  const { chunk } = await reader.request<{ chunk: TimelineEvent[] }>(
    "GET",
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${unread + 200}`,
  );
  if (unread === 0) return chunk[0]?.event_id;
  let seen = 0;
  for (const ev of chunk) {
    if (notifies(ev, reader.userId) && seen++ === unread) return ev.event_id;
  }
  return undefined;
}

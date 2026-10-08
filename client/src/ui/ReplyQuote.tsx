import { summarize } from "../matrix/events";
import type { EventId, RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import { currentBody } from "../timeline/merge";
import { firstLine, truncate } from "../utils/text";
import { SenderName } from "./SenderName";
import { useTimelineActions } from "./timeline-actions";

export function ReplyQuote({ roomId, eventId }: { roomId: RoomId; eventId: EventId }) {
  const parent = useSelector((s) => s.timelines[roomId]?.items[eventId]);
  const actions = useTimelineActions();

  const text = parent
    ? parent.redacted
      ? "Message deleted"
      : (currentBody(parent) ?? summarize(parent.event))
    : null;
  return (
    <button type="button" className="reply-quote" onClick={() => actions.jumpTo(eventId)}>
      {parent ? (
        <>
          <SenderName roomId={roomId} userId={parent.event.sender} />
          <span className="reply-quote__text">{truncate(firstLine(text ?? ""), 120)}</span>
        </>
      ) : (
        <span className="reply-quote__text muted">In reply to an earlier message</span>
      )}
    </button>
  );
}

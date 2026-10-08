import { memo } from "react";
import { assertNever } from "../matrix/events";
import { localpart, type EventId, type RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import type { TimelineItem } from "../timeline/merge";
import { Avatar } from "./Avatar";
import { ImageBody } from "./ImageBody";
import { MessageBody } from "./MessageBody";
import { Reactions } from "./Reactions";
import { ReplyQuote } from "./ReplyQuote";
import { SenderName } from "./SenderName";
import { useSession } from "./session-context";
import { TileActions } from "./TileActions";
import { useTimelineActions } from "./timeline-actions";
import { Timestamp } from "./Timestamp";

interface Props {
  roomId: RoomId;
  eventId: EventId;
  continuation: boolean;
  highlighted: boolean;
}

function TileBody({ item }: { item: TimelineItem }) {
  const { event } = item;
  if (item.redacted) return <p className="body body--deleted">Message deleted</p>;

  const edited = item.edits[item.edits.length - 1];
  switch (event.kind) {
    case "text":
      return (
        <MessageBody
          body={edited?.body ?? event.body}
          prefix={event.emote ? `* ${localpart(event.sender)}` : undefined}
        />
      );
    case "notice":
    case "reply":
      return <MessageBody body={edited?.body ?? event.body} />;
    case "image":
      return <ImageBody body={event.body} url={event.url} info={event.info} />;
    case "redacted":
      return <p className="body body--deleted">Message deleted</p>;
    case "unknown":
      return <p className="body body--unsupported">Unsupported message</p>;
    default:
      return assertNever(event);
  }
}

function LocalStatus({ item }: { item: TimelineItem }) {
  const actions = useTimelineActions();
  if (!item.local) return null;
  if (item.local.status === "sending") return <span className="local-status muted">Sending…</span>;
  const { txnId } = item.local;
  return (
    <span className="local-status local-status--failed" role="alert">
      Not sent.
      <button type="button" className="link-button" onClick={() => actions.retry(txnId)}>
        Retry
      </button>
      <button type="button" className="link-button" onClick={() => actions.cancel(txnId)}>
        Delete
      </button>
    </span>
  );
}

export const EventTile = memo(function EventTile({ roomId, eventId, continuation, highlighted }: Props) {
  const item = useSelector((s) => s.timelines[roomId]?.items[eventId]);
  const { session } = useSession();
  if (!item) return null;

  const { event } = item;
  const own = event.sender === session.userId;
  const hasReactions = Object.keys(item.reactions).length > 0;
  const editable = own && !item.redacted && (event.kind === "text" || event.kind === "reply");
  const classes = [
    "tile",
    continuation ? "tile--continuation" : "",
    event.kind === "notice" ? "tile--notice" : "",
    item.local ? `tile--${item.local.status}` : "",
    highlighted ? "tile--highlighted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes} data-event-id={eventId}>
      <div className="tile__gutter">
        {continuation ? (
          <span className="tile__hover-time">
            <Timestamp ts={event.ts} variant="clock" />
          </span>
        ) : (
          <Avatar id={event.sender} name={localpart(event.sender)} size={36} />
        )}
      </div>
      <div className="tile__main">
        {continuation ? null : (
          <header className="tile__header">
            <SenderName roomId={roomId} userId={event.sender} />
            <Timestamp ts={event.ts} />
          </header>
        )}
        {event.kind === "reply" && !item.redacted ? (
          <ReplyQuote roomId={roomId} eventId={event.inReplyTo} />
        ) : null}
        <TileBody item={item} />
        {item.edits.length > 0 && !item.redacted ? <span className="edited muted">(edited)</span> : null}
        {hasReactions ? <Reactions eventId={eventId} reactions={item.reactions} me={session.userId} /> : null}
        <LocalStatus item={item} />
      </div>
      {item.local || item.redacted ? null : (
        <TileActions eventId={eventId} canEdit={editable} canDelete={own} />
      )}
    </article>
  );
});

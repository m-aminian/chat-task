import { useState } from "react";
import type { EventId, UserId } from "../matrix/ids";
import { localpart } from "../matrix/ids";
import { joinNames } from "../utils/text";
import { useTimelineActions } from "./timeline-actions";

const COLLAPSED_LIMIT = 12;

interface Props {
  eventId: EventId;
  reactions: Record<string, Record<UserId, EventId>>;
  me: UserId;
}

export function Reactions({ eventId, reactions, me }: Props) {
  const actions = useTimelineActions();
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(reactions)
    .map(([key, senders]) => ({ key, senders: Object.keys(senders) as UserId[], mine: senders[me] }))
    .sort((a, b) => b.senders.length - a.senders.length);
  const visible = expanded ? entries : entries.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="reactions">
      {visible.map(({ key, senders, mine }) => (
        <button
          key={key}
          type="button"
          className={`reaction${mine ? " reaction--mine" : ""}`}
          aria-pressed={Boolean(mine)}
          title={joinNames(senders.map(localpart), 5)}
          onClick={() => (mine ? actions.redact(mine) : actions.react(eventId, key))}
        >
          <span>{key}</span>
          <span className="reaction__count">{senders.length}</span>
        </button>
      ))}
      {entries.length > COLLAPSED_LIMIT ? (
        <button type="button" className="reaction reaction--more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `+${entries.length - COLLAPSED_LIMIT}`}
        </button>
      ) : null}
    </div>
  );
}

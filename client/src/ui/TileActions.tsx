import { useState } from "react";
import type { EventId } from "../matrix/ids";
import { useTimelineActions } from "./timeline-actions";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🚀", "✅", "🙏"] as const;

interface Props {
  eventId: EventId;
  canEdit: boolean;
  canDelete: boolean;
}

export function TileActions({ eventId, canEdit, canDelete }: Props) {
  const actions = useTimelineActions();
  const [picking, setPicking] = useState(false);

  return (
    <div className="tile-actions" role="toolbar" aria-label="Message actions">
      {picking ? (
        <div className="quick-reactions">
          {QUICK_REACTIONS.map((key) => (
            <button
              key={key}
              type="button"
              className="icon-button"
              onClick={() => {
                actions.react(eventId, key);
                setPicking(false);
              }}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className="icon-button" title="React" onClick={() => setPicking((v) => !v)}>
        ☺
      </button>
      <button type="button" className="icon-button" title="Reply" onClick={() => actions.reply(eventId)}>
        ↩
      </button>
      {canEdit ? (
        <button type="button" className="icon-button" title="Edit" onClick={() => actions.edit(eventId)}>
          ✎
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          className="icon-button"
          title="Delete"
          onClick={() => {
            if (window.confirm("Delete this message for everyone?")) actions.redact(eventId);
          }}
        >
          🗑
        </button>
      ) : null}
    </div>
  );
}

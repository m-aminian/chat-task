import { useEffect, useState } from "react";
import { isRelation, parseEvent, summarize, type MessageEvent } from "../matrix/events";
import type { RoomId } from "../matrix/ids";
import { useClient } from "../store/react";
import { pluralize, truncate } from "../utils/text";
import { SenderName } from "./SenderName";
import { Spinner } from "./Spinner";
import { useTimelineActions } from "./timeline-actions";
import { Timestamp } from "./Timestamp";

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 20;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: MessageEvent[]; total: number }
  | { status: "error"; message: string };

interface Props {
  roomId: RoomId;
  onClose: () => void;
}

export function SearchPanel({ roomId, onClose }: Props) {
  const { api } = useClient();
  const actions = useTimelineActions();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const timer = setTimeout(() => {
      api
        .search(roomId, term, { limit: RESULT_LIMIT })
        .then((res) => {
          const { results, count } = res.search_categories.room_events;
          const events = results
            .map((r) => parseEvent(r.result))
            .filter((e): e is MessageEvent => e !== null && !isRelation(e) && e.kind !== "unknown");
          setState({ status: "done", results: events, total: count ?? events.length });
        })
        .catch((err: unknown) => {
          setState({ status: "error", message: err instanceof Error ? err.message : "Search failed" });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, roomId, query]);

  return (
    <div className="search-panel" role="search">
      <div className="search-panel__bar">
        <input
          type="search"
          autoFocus
          placeholder="Search this room"
          aria-label="Search this room"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <button type="button" className="icon-button" aria-label="Close search" onClick={onClose}>
          ×
        </button>
      </div>
      {state.status === "loading" ? <Spinner label="Searching" /> : null}
      {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
      {state.status === "done" ? (
        <>
          <p className="muted search-panel__count">{pluralize(state.total, "result")}</p>
          <ul className="search-panel__results">
            {state.results.map((event) => (
              <li key={event.eventId}>
                <button type="button" className="search-result" onClick={() => actions.jumpTo(event.eventId)}>
                  <span className="search-result__meta">
                    <SenderName roomId={roomId} userId={event.sender} /> <Timestamp ts={event.ts} />
                  </span>
                  <span className="search-result__text">{truncate(summarize(event), 160)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

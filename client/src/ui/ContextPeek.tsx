import { useEffect, useState } from "react";
import { MatrixApiError } from "../matrix/api";
import { isRelation, parseEvent, summarize, type MessageEvent } from "../matrix/events";
import type { EventId, RoomId } from "../matrix/ids";
import { useClient } from "../store/react";
import { Dialog } from "./Dialog";
import { SenderName } from "./SenderName";
import { Spinner } from "./Spinner";
import { Timestamp } from "./Timestamp";

type PeekState =
  | { status: "loading" }
  | { status: "ready"; events: MessageEvent[] }
  | { status: "missing" }
  | { status: "error"; message: string };

const CONTEXT_LIMIT = 6;

function messages(raw: readonly unknown[]): MessageEvent[] {
  return raw
    .map(parseEvent)
    .filter((e): e is MessageEvent => e !== null && !isRelation(e) && e.kind !== "unknown");
}

export function ContextPeek({
  roomId,
  eventId,
  onClose,
}: {
  roomId: RoomId;
  eventId: EventId;
  onClose: () => void;
}) {
  const { api } = useClient();
  const [state, setState] = useState<PeekState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    api
      .context(eventId, roomId, { limit: CONTEXT_LIMIT, signal: controller.signal })
      .then((res) => {
        const events = [
          ...messages([...res.events_before].reverse()),
          ...messages([res.event]),
          ...messages(res.events_after),
        ];
        setState({ status: "ready", events });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof MatrixApiError && err.status === 404) setState({ status: "missing" });
        else setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => controller.abort();
  }, [api, roomId, eventId]);

  return (
    <Dialog title="Earlier message" onClose={onClose}>
      {state.status === "loading" ? <Spinner /> : null}
      {state.status === "missing" ? <p className="muted">This message is no longer available.</p> : null}
      {state.status === "error" ? (
        <p className="form-error">Could not load the message: {state.message}</p>
      ) : null}
      {state.status === "ready" ? (
        <ol className="peek">
          {state.events.map((event) => (
            <li key={event.eventId} className={event.eventId === eventId ? "peek__target" : undefined}>
              <SenderName roomId={roomId} userId={event.sender} /> <Timestamp ts={event.ts} variant="clock" />
              <p>{summarize(event)}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </Dialog>
  );
}

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useScrollAnchor } from "../hooks/useScrollAnchor";
import type { EventId, RoomId } from "../matrix/ids";
import { useClient, useSelector } from "../store/react";
import { rowsEqual, selectRows } from "../store/selectors";
import { loadOlder } from "../timeline/pagination";
import { Spinner } from "./Spinner";
import { TimelineEntry } from "./TimelineEntry";
import { errorMessage, showToast } from "./toast-store";

const HEADER_HEIGHT = 56;
const BOTTOM_THRESHOLD_PX = 48;
const NEAR_TOP_PX = 600;
const HIGHLIGHT_MS = 2_000;

export interface TimelineHandle {
  scrollToEvent(eventId: EventId): boolean;
  scrollToBottom(): void;
}

interface Props {
  roomId: RoomId;
  onAtBottomChange: (atBottom: boolean) => void;
}

export const Timeline = forwardRef<TimelineHandle, Props>(function Timeline(
  { roomId, onAtBottomChange },
  ref,
) {
  const { api, store } = useClient();
  const rows = useSelector((s) => selectRows(s.timelines[roomId]), rowsEqual);
  const canPaginate = useSelector((s) => (s.timelines[roomId]?.prevBatch ?? null) !== null);
  const paginating = useSelector((s) => s.paginating[roomId] ?? false);
  const [highlighted, setHighlighted] = useState<EventId | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const requests = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    return () => controller.abort();
  }, []);

  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const [nearTop, setNearTop] = useState(true);

  useScrollAnchor(
    scrollRef,
    rows,
    (index) => rowElements.current.get(rows[index]?.key ?? "")?.offsetTop,
    stickToBottom,
    rows.length,
  );

  useEffect(() => {
    const controller = requests.current;
    if (!controller || !canPaginate || paginating || !nearTop) return;
    loadOlder(api, store, roomId, controller.signal).catch((err: unknown) => {
      if (!controller.signal.aborted)
        showToast(`Could not load older messages: ${errorMessage(err)}`, "error");
    });
  }, [api, store, roomId, canPaginate, paginating, nearTop]);

  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setNearTop(el.scrollTop < NEAR_TOP_PX);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    if (atBottom !== stickToBottom.current) {
      stickToBottom.current = atBottom;
      onAtBottomChange(atBottom);
    }
  }, [onAtBottomChange]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToEvent(eventId) {
        const index = rows.findIndex((r) => r.type === "event" && r.eventId === eventId);
        if (index < 0) return false;
        stickToBottom.current = false;
        onAtBottomChange(false);
        rowElements.current.get(rows[index]!.key)?.scrollIntoView({ block: "center" });
        setHighlighted(eventId);
        return true;
      },
      scrollToBottom() {
        stickToBottom.current = true;
        onAtBottomChange(true);
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      },
    }),
    [rows, onAtBottomChange],
  );

  return (
    <div ref={scrollRef} className="timeline" onScroll={handleScroll} tabIndex={0} aria-label="Messages">
      <div className="timeline__canvas">
        <div className="timeline__header" style={{ height: HEADER_HEIGHT }}>
          {paginating ? (
            <Spinner label="Loading older messages" />
          ) : canPaginate ? null : (
            <p className="muted">This is the beginning of the room.</p>
          )}
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            ref={(el) => {
              if (el) rowElements.current.set(row.key, el);
              else rowElements.current.delete(row.key);
            }}
          >
            <TimelineEntry
              roomId={roomId}
              row={row}
              highlighted={row.type === "event" && highlighted === row.eventId}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

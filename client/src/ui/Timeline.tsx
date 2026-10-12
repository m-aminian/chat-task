import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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
const OVERSCAN = 8;
const DAY_ROW_ESTIMATE = 32;
const CONTINUATION_ROW_ESTIMATE = 24;
const EVENT_ROW_ESTIMATE = 64;

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

  const [nearTop, setNearTop] = useState(true);

  // `getItemKey` is a dependency of the virtualizer's measurement memo, so a
  // fresh closure per render invalidates it and re-walks all `count` rows —
  // 20k iterations on every scroll frame in #big. Reading `rows` through a ref
  // keeps the callbacks stable, so measurements are only recomputed when the
  // row set actually changes.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const estimateSize = useCallback((index: number) => {
    const row = rowsRef.current[index];
    if (!row) return EVENT_ROW_ESTIMATE;
    if (row.type === "day") return DAY_ROW_ESTIMATE;
    return row.continuation ? CONTINUATION_ROW_ESTIMATE : EVENT_ROW_ESTIMATE;
  }, []);

  const getItemKey = useCallback((index: number) => rowsRef.current[index]?.key ?? index, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    paddingStart: HEADER_HEIGHT,
    // A chat timeline grows at the end and is paginated at the start, which is
    // exactly what these two express. `anchorTo: "end"` makes the virtualizer
    // re-resolve the row at the current offset whenever `count` or the edge
    // keys change, and compensate again as each prepended row swaps its size
    // estimate for a real measurement — so loading history does not shove the
    // viewport around. `followOnAppend` keeps us pinned to the newest message
    // only while we are already there.
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: BOTTOM_THRESHOLD_PX,
  });

  // Open a room at its newest message; followOnAppend keeps us there. Keyed on
  // roomId alone on purpose — adding the other referenced values would re-snap
  // the viewport to the bottom while someone is reading history.
  const openAtNewest = useRef<(() => void) | null>(null);
  openAtNewest.current = () => {
    stickToBottom.current = true;
    onAtBottomChange(true);
    virtualizer.scrollToEnd();
  };
  useEffect(() => {
    openAtNewest.current?.();
  }, [roomId]);

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
        virtualizer.scrollToIndex(index, { align: "center" });
        setHighlighted(eventId);
        return true;
      },
      scrollToBottom() {
        stickToBottom.current = true;
        onAtBottomChange(true);
        virtualizer.scrollToEnd();
      },
    }),
    [rows, onAtBottomChange, virtualizer],
  );

  return (
    <div ref={scrollRef} className="timeline" onScroll={handleScroll} tabIndex={0} aria-label="Messages">
      <div className="timeline__canvas" style={{ height: virtualizer.getTotalSize() }}>
        <div className="timeline__header" style={{ height: HEADER_HEIGHT }}>
          {paginating ? (
            <Spinner label="Loading older messages" />
          ) : canPaginate ? null : (
            <p className="muted">This is the beginning of the room.</p>
          )}
        </div>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;
          return (
            <div
              key={row.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="timeline__row"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <TimelineEntry
                roomId={roomId}
                row={row}
                highlighted={row.type === "event" && highlighted === row.eventId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

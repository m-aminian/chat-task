import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { TimelineRow } from "../store/selectors";

export function useScrollAnchor(
  scrollRef: RefObject<HTMLElement>,
  rows: readonly TimelineRow[],
  startOf: (index: number) => number | undefined,
  stickToBottom: MutableRefObject<boolean>,
  contentHeight: number,
): void {
  const anchor = useRef<{ key: string; start: number } | null>(null);
  const startOfRef = useRef(startOf);
  startOfRef.current = startOf;

  useEffect(() => {
    const el = scrollRef.current;
    const firstEvent = rows.findIndex((r) => r.type === "event");
    const start = firstEvent >= 0 ? startOfRef.current(firstEvent) : undefined;
    const previous = anchor.current;
    anchor.current = start !== undefined ? { key: rows[firstEvent]!.key, start } : null;

    if (!el || !previous || start === undefined || rows[firstEvent]!.key === previous.key) return;
    if (stickToBottom.current) return;
    const index = rows.findIndex((r) => r.key === previous.key);
    const moved = index >= 0 ? startOfRef.current(index) : undefined;
    if (moved !== undefined) el.scrollTop += moved - previous.start;
  }, [rows, scrollRef, stickToBottom]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows, contentHeight, scrollRef, stickToBottom]);
}

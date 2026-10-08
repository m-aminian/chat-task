import { useCallback, useEffect, useRef } from "react";
import type { EventId, RoomId } from "../matrix/ids";
import { useSetting } from "../settings/settings";
import { useClient } from "../store/react";
import { useDocumentVisible } from "./useDocumentVisible";
import { useLiveEvents } from "./useLiveEvents";

const RECEIPT_DELAY_MS = 600;

export function useReadReceipts(roomId: RoomId, atBottom: boolean): void {
  const { api, store } = useClient();
  const enabled = useSetting("sendReadReceipts");
  const visible = useDocumentVisible();
  const lastSent = useRef(new Map<RoomId, EventId>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const markRead = useCallback(
    (targetRoom: RoomId) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const order = store.getState().timelines[targetRoom]?.order;
        const latest = order?.[order.length - 1];
        if (!latest || lastSent.current.get(targetRoom) === latest) return;
        lastSent.current.set(targetRoom, latest);
        api.sendReadReceipt(targetRoom, latest).catch(() => lastSent.current.delete(targetRoom));
      }, RECEIPT_DELAY_MS);
    },
    [api, store],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (enabled && visible && atBottom) markRead(roomId);
  }, [enabled, visible, atBottom, roomId, markRead]);

  useLiveEvents(roomId, () => {
    if (enabled && visible && atBottom) markRead(roomId);
  });
}

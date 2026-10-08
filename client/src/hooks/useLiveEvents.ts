import { useEffect, useLayoutEffect, useRef } from "react";
import type { MessageEvent } from "../matrix/events";
import type { RoomId } from "../matrix/ids";
import { useClient } from "../store/react";

export function useLiveEvents(roomId: RoomId, handler: (events: readonly MessageEvent[]) => void): void {
  const { engine } = useClient();
  const latest = useRef(handler);

  useLayoutEffect(() => {
    latest.current = handler;
  });

  useEffect(
    () =>
      engine.onLiveEvents((eventRoomId, events) => {
        if (eventRoomId === roomId) latest.current(events);
      }),
    [engine],
  );
}

import { useCallback, useEffect, useRef } from "react";
import type { RoomId } from "../matrix/ids";
import { useClient } from "../store/react";

const SERVER_TIMEOUT_MS = 5_000;
const REFRESH_MS = 3_000;
const IDLE_MS = 4_000;

export function useTypingNotifier(roomId: RoomId) {
  const { api } = useClient();
  const lastSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useCallback(
    (typing: boolean) => {
      api.setTyping(roomId, typing, SERVER_TIMEOUT_MS).catch(() => undefined);
    },
    [api, roomId],
  );

  const stop = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (lastSent.current !== 0) {
      lastSent.current = 0;
      send(false);
    }
  }, [send]);

  const onInput = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current > REFRESH_MS) {
      lastSent.current = now;
      send(true);
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, IDLE_MS);
  }, [send, stop]);

  useEffect(() => stop, [stop]);

  return { onInput, stop };
}

import { useSyncExternalStore } from "react";
import { formatRelative } from "../utils/format";

const TICK_MS = 30_000;

function createClock() {
  let now = Date.now();
  const listeners = new Set<() => void>();

  const tick = () => {
    now = Date.now();
    for (const listener of [...listeners]) listener();
  };

  return {
    now: () => now,
    subscribe(listener: () => void) {
      listeners.add(listener);
      now = Date.now();
      const timer = setInterval(tick, TICK_MS);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) clearInterval(timer);
      };
    },
  };
}

export const clock = createClock();

export function useRelativeTime(ts: number): string {
  return useSyncExternalStore(clock.subscribe, () => formatRelative(ts, clock.now()));
}

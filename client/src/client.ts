import { MatrixApi, type Session } from "./matrix/api";
import { SendQueue } from "./send/queue";
import type { Client } from "./store/react";
import { initialState, type AppState } from "./store/state";
import { createStore } from "./store/store";
import { SyncEngine } from "./sync/engine";
import { currentBody, displayOrder } from "./timeline/merge";

export function createClient(session: Session): Client {
  const api = new MatrixApi(session);
  const store = createStore<AppState>(initialState);
  const engine = new SyncEngine(api, store);
  const queue = new SendQueue(api, store, session.userId);
  return { api, store, engine, queue };
}

export interface TimelineSnapshot {
  [roomId: string]: { order: string[]; bodies: Record<string, string | null> };
}

export function exposeTimelines(client: Client): () => void {
  Object.defineProperty(window, "__timeline", {
    configurable: true,
    get(): TimelineSnapshot {
      const snapshot: TimelineSnapshot = {};
      for (const [roomId, tl] of Object.entries(client.store.getState().timelines)) {
        const order = displayOrder(tl);
        const bodies: Record<string, string | null> = {};
        for (const id of order) {
          const item = tl.items[id];
          if (item) bodies[id] = currentBody(item);
        }
        snapshot[roomId] = { order, bodies };
      }
      return snapshot;
    },
  });
  return () => {
    delete (window as { __timeline?: unknown }).__timeline;
  };
}

import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { MatrixApi } from "../matrix/api";
import type { SendQueue } from "../send/queue";
import type { SyncEngine } from "../sync/engine";
import type { AppState } from "./state";
import type { Store } from "./store";

export interface Client {
  api: MatrixApi;
  store: Store<AppState>;
  engine: SyncEngine;
  queue: SendQueue;
}

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useClient must be used inside <ClientProvider>");
  return client;
}

export function useSelector<T>(
  selector: (state: AppState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const { store } = useClient();
  const cached = useRef<{ value: T } | null>(null);

  const getSnapshot = () => {
    const next = selector(store.getState());
    if (cached.current && isEqual(cached.current.value, next)) return cached.current.value;
    cached.current = { value: next };
    return next;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot);
}

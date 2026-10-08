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
const StateContext = createContext<AppState | null>(null);

export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  const state = useSyncExternalStore(client.store.subscribe, client.store.getState);
  return (
    <ClientContext.Provider value={client}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ClientContext.Provider>
  );
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
  const state = useContext(StateContext);
  if (!state) throw new Error("useSelector must be used inside <ClientProvider>");
  const value = selector(state);
  const previous = useRef(value);
  if (!isEqual(previous.current, value)) previous.current = value;
  return previous.current;
}

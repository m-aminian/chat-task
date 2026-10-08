import type { MatrixApi } from "../matrix/api";
import { parseEvent, type MatrixEvent } from "../matrix/events";
import type { RoomId } from "../matrix/ids";
import { applyBackPage, setPaginating } from "../store/reducers";
import type { AppState } from "../store/state";
import type { Store } from "../store/store";
import { MESSAGES_FILTER } from "../sync/filter";

const PAGE_SIZE = 50;

export async function loadOlder(
  api: MatrixApi,
  store: Store<AppState>,
  roomId: RoomId,
  signal: AbortSignal,
): Promise<void> {
  const state = store.getState();
  const from = state.timelines[roomId]?.prevBatch;
  if (!from || state.paginating[roomId]) return;

  store.setState((s) => setPaginating(s, roomId, true));
  try {
    const res = await api.messages(roomId, {
      from,
      dir: "b",
      limit: PAGE_SIZE,
      filter: MESSAGES_FILTER,
      signal,
    });
    if (signal.aborted) return;
    const chunk = res.chunk.map(parseEvent).filter((e): e is MatrixEvent => e !== null);
    const end = res.end && res.chunk.length > 0 ? res.end : null;
    store.setState((s) => applyBackPage(s, roomId, from, chunk, end));
  } finally {
    store.setState((s) => setPaginating(s, roomId, false));
  }
}

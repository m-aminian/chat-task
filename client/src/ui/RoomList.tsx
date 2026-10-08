import { useDeferredValue, useState } from "react";
import type { RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import { arraysEqual, selectRoomOrder } from "../store/selectors";
import type { AppState } from "../store/state";
import { RoomListItem } from "./RoomListItem";

interface Props {
  activeRoomId: RoomId | null;
  onSelect: (roomId: RoomId) => void;
}

function matchingRooms(state: AppState, query: string): RoomId[] {
  const order = selectRoomOrder(state);
  const needle = query.trim().toLowerCase();
  if (!needle) return order;
  return order.filter((id) => state.rooms[id]?.name.toLowerCase().includes(needle));
}

export function RoomList({ activeRoomId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const rooms = useSelector((s) => matchingRooms(s, deferredQuery), arraysEqual);

  return (
    <nav className="room-list" aria-label="Rooms">
      <div className="room-list__header">
        <h2>Rooms</h2>
        <input
          className="room-list__search"
          type="search"
          placeholder="Filter rooms"
          aria-label="Filter rooms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="room-list__items">
        {rooms.map((roomId) => (
          <RoomListItem key={roomId} roomId={roomId} active={roomId === activeRoomId} onSelect={onSelect} />
        ))}
      </ul>
      {rooms.length === 0 ? <p className="muted room-list__empty">No rooms match “{query}”.</p> : null}
    </nav>
  );
}

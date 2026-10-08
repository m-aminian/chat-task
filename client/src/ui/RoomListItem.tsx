import { memo } from "react";
import { useRelativeTime } from "../hooks/time";
import { localpart, type RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import { formatCount } from "../utils/format";
import { firstLine, truncate } from "../utils/text";
import { Avatar } from "./Avatar";

interface Props {
  roomId: RoomId;
  active: boolean;
  onSelect: (roomId: RoomId) => void;
}

function ActivityTime({ ts }: { ts: number }) {
  const label = useRelativeTime(ts);
  return <time className="room-item__time">{label}</time>;
}

export const RoomListItem = memo(function RoomListItem({ roomId, active, onSelect }: Props) {
  const room = useSelector((s) => s.rooms[roomId]);
  if (!room) return null;
  const preview = room.preview
    ? `${localpart(room.preview.sender)}: ${truncate(firstLine(room.preview.text), 60)}`
    : "";

  return (
    <li>
      <button
        type="button"
        className={`room-item${active ? " room-item--active" : ""}${room.unread > 0 ? " room-item--unread" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(roomId)}
      >
        <Avatar id={roomId} name={room.name} size={36} />
        <span className="room-item__text">
          <span className="room-item__name">{room.name}</span>
          <span className="room-item__preview">{preview}</span>
        </span>
        <span className="room-item__meta">
          {room.lastActivity > 0 ? <ActivityTime ts={room.lastActivity} /> : null}
          {room.unread > 0 ? (
            <span
              className={`badge${room.highlights > 0 ? " badge--highlight" : ""}`}
              aria-label={`${room.unread} unread`}
            >
              {formatCount(room.unread)}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
});

import type { RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import { pluralize, truncate } from "../utils/text";

interface Props {
  roomId: RoomId;
  infoOpen: boolean;
  searchOpen: boolean;
  onToggleInfo: () => void;
  onToggleSearch: () => void;
}

export function RoomHeader({ roomId, infoOpen, searchOpen, onToggleInfo, onToggleSearch }: Props) {
  const name = useSelector((s) => s.rooms[roomId]?.name ?? "");
  const topic = useSelector((s) => s.rooms[roomId]?.topic ?? "");
  const memberCount = useSelector((s) => Object.keys(s.members[roomId] ?? {}).length);

  return (
    <header className="room-header">
      <div className="room-header__titles">
        <h1 className="room-header__name">{name}</h1>
        {topic ? <p className="room-header__topic">{truncate(topic, 140)}</p> : null}
      </div>
      {memberCount > 0 ? <span className="muted">{pluralize(memberCount, "member")}</span> : null}
      <button
        type="button"
        className={`icon-button${searchOpen ? " icon-button--active" : ""}`}
        aria-pressed={searchOpen}
        aria-label="Search"
        title="Search"
        onClick={onToggleSearch}
      >
        ⌕
      </button>
      <button
        type="button"
        className={`icon-button${infoOpen ? " icon-button--active" : ""}`}
        aria-pressed={infoOpen}
        aria-label="Room info"
        title="Room info"
        onClick={onToggleInfo}
      >
        ⓘ
      </button>
    </header>
  );
}

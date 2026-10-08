import { useEffect, useState } from "react";
import { localpart, type RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import type { Member } from "../store/state";
import { copyText } from "../utils/clipboard";
import { Avatar } from "./Avatar";
import { showToast } from "./toast-store";

interface Props {
  roomId: RoomId;
  onClose: () => void;
}

const EMPTY: Record<string, Member> = {};

function byName(a: Member, b: Member): number {
  const left = a.displayName ?? localpart(a.userId);
  const right = b.displayName ?? localpart(b.userId);
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function RoomInfoDrawer({ roomId, onClose }: Props) {
  const room = useSelector((s) => s.rooms[roomId]);
  const members = useSelector((s) => s.members[roomId] ?? EMPTY);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!room) return null;
  const list = Object.values(members);
  const needle = filter.trim().toLowerCase();
  const sorted = list
    .slice()
    .sort(byName)
    .filter(
      (m) =>
        !needle || (m.displayName ?? m.userId).toLowerCase().includes(needle) || m.userId.includes(needle),
    );

  return (
    <aside className="drawer" aria-label="Room info">
      <header className="drawer__header">
        <h2>{room.name}</h2>
        <button type="button" className="icon-button" aria-label="Close room info" onClick={onClose}>
          ×
        </button>
      </header>
      {room.topic ? <p className="drawer__topic">{room.topic}</p> : null}
      <dl className="drawer__facts">
        <dt>Room ID</dt>
        <dd>
          <code>{roomId}</code>{" "}
          <button
            type="button"
            className="link-button"
            onClick={async () => showToast((await copyText(roomId)) ? "Room ID copied" : "Copy failed")}
          >
            Copy
          </button>
        </dd>
        <dt>Members</dt>
        <dd>{list.length}</dd>
      </dl>
      <input
        className="drawer__filter"
        type="search"
        placeholder="Filter members"
        aria-label="Filter members"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="member-list">
        {sorted.map((member) => (
          <li key={member.userId} className="member">
            <Avatar id={member.userId} name={member.displayName ?? localpart(member.userId)} size={28} />
            <span className="member__name">{member.displayName ?? localpart(member.userId)}</span>
            <span className="member__id muted">{member.userId}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

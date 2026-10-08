import { useDisplayName } from "../hooks/useRoomMembers";
import type { RoomId, UserId } from "../matrix/ids";
import { userColor } from "../utils/color";

export function SenderName({ roomId, userId }: { roomId: RoomId; userId: UserId }) {
  const name = useDisplayName(roomId, userId);
  return (
    <span className="sender" style={{ color: userColor(userId) }} title={userId}>
      {name}
    </span>
  );
}

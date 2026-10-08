import type { RoomId } from "../matrix/ids";
import { localpart } from "../matrix/ids";
import { useSetting } from "../settings/settings";
import { useSelector } from "../store/react";
import { arraysEqual, selectTyping } from "../store/selectors";
import { joinNames } from "../utils/text";
import { useSession } from "./session-context";

export function TypingIndicator({ roomId }: { roomId: RoomId }) {
  const enabled = useSetting("showTyping");
  const { session } = useSession();
  const typing = useSelector(selectTyping(roomId), arraysEqual);
  const names = useSelector(
    (s) =>
      typing
        .filter((u) => u !== session.userId)
        .map((u) => s.members[roomId]?.[u]?.displayName ?? localpart(u)),
    arraysEqual,
  );

  return (
    <div className="typing" aria-live="off">
      {enabled && names.length > 0 ? (
        <span>
          {joinNames(names)} {names.length === 1 ? "is" : "are"} typing…
        </span>
      ) : null}
    </div>
  );
}

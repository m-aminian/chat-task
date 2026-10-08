import { useEffect } from "react";
import type { RoomId, UserId } from "../matrix/ids";
import { localpart, toUserId } from "../matrix/ids";
import { useClient, useSelector } from "../store/react";
import { setMembers } from "../store/reducers";
import type { Member } from "../store/state";

export function useRoomMembers(roomId: RoomId): void {
  const { api, store } = useClient();

  useEffect(() => {
    if (store.getState().members[roomId]) return;
    const controller = new AbortController();
    api
      .joinedMembers(roomId, controller.signal)
      .then((joined) => {
        const members: Record<UserId, Member> = {};
        for (const [id, profile] of Object.entries(joined)) {
          const userId = toUserId(id);
          members[userId] = {
            userId,
            displayName: profile.display_name ?? null,
            avatarUrl: profile.avatar_url ?? null,
          };
        }
        store.setState((s) => setMembers(s, roomId, members));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn("Could not load members", err);
      });
    return () => controller.abort();
  }, [api, store, roomId]);
}

export function useDisplayName(roomId: RoomId, userId: UserId): string {
  const name = useSelector((s) => s.members[roomId]?.[userId]?.displayName ?? null);
  return name ?? localpart(userId);
}

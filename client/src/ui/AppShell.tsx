import { useCallback, useEffect, useState, useTransition } from "react";
import { isRoomId, type RoomId } from "../matrix/ids";
import { useSelector } from "../store/react";
import { arraysEqual, selectRoomOrder, selectTotalUnread } from "../store/selectors";
import { ConnectionBanner } from "./ConnectionBanner";
import { ProfilePanel } from "./ProfilePanel";
import { RoomList } from "./RoomList";
import { RoomView } from "./RoomView";
import { SettingsPage } from "./SettingsPage";
import { Spinner } from "./Spinner";
import { Toasts } from "./Toasts";
import { UserBar } from "./UserBar";

type Overlay = "settings" | "profile" | null;

function roomFromHash(): RoomId | null {
  const value = decodeURIComponent(window.location.hash.replace(/^#\/room\//, ""));
  return isRoomId(value) ? value : null;
}

export function AppShell() {
  const [roomId, setRoomId] = useState<RoomId | null>(roomFromHash);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [isSwitching, startTransition] = useTransition();
  const status = useSelector((s) => s.syncStatus);
  const roomOrder = useSelector(selectRoomOrder, arraysEqual);
  const totalUnread = useSelector(selectTotalUnread);
  const roomKnown = useSelector((s) => (roomId ? s.rooms[roomId] !== undefined : false));

  const selectRoom = useCallback((next: RoomId) => {
    startTransition(() => setRoomId(next));
    window.history.replaceState(null, "", `#/room/${encodeURIComponent(next)}`);
  }, []);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Chat` : "Chat";
  }, [totalUnread]);

  useEffect(() => {
    if (roomKnown) return;
    const first = roomOrder[0];
    if (first) selectRoom(first);
  }, [roomKnown, roomOrder, selectRoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      const index = roomId ? roomOrder.indexOf(roomId) : -1;
      const next = roomOrder[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (next) {
        event.preventDefault();
        selectRoom(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [roomId, roomOrder, selectRoom]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <RoomList activeRoomId={roomId} onSelect={selectRoom} />
        <UserBar onOpenProfile={() => setOverlay("profile")} onOpenSettings={() => setOverlay("settings")} />
      </aside>
      <main className={`main${isSwitching ? " main--switching" : ""}`}>
        <ConnectionBanner />
        {status === "initial" ? (
          <div className="empty">
            <Spinner label="Syncing" />
            <p>Syncing…</p>
          </div>
        ) : roomId && roomKnown ? (
          <RoomView roomId={roomId} />
        ) : (
          <div className="empty">
            <p>Select a room to start chatting.</p>
          </div>
        )}
      </main>
      {overlay === "settings" ? <SettingsPage onClose={() => setOverlay(null)} /> : null}
      {overlay === "profile" ? <ProfilePanel onClose={() => setOverlay(null)} /> : null}
      <Toasts />
    </div>
  );
}

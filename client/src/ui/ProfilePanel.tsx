import { useEffect, useState, type FormEvent } from "react";
import { localpart } from "../matrix/ids";
import { useClient } from "../store/react";
import { Avatar } from "./Avatar";
import { Dialog } from "./Dialog";
import { useSession } from "./session-context";
import { errorMessage, showToast } from "./toast-store";

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { api } = useClient();
  const { session, logout } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getDisplayName(session.userId)
      .then((name) => {
        if (cancelled) return;
        setDisplayName(name ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, session.userId]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.setDisplayName(displayName.trim());
      showToast("Display name updated");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {}
    logout();
  }

  return (
    <Dialog title="Profile" onClose={onClose} variant="panel">
      <div className="profile">
        <Avatar id={session.userId} name={displayName || localpart(session.userId)} size={64} />
        <dl className="profile__facts">
          <dt>User ID</dt>
          <dd>
            <code>{session.userId}</code>
          </dd>
          <dt>Device</dt>
          <dd>
            <code>{session.deviceId}</code>
          </dd>
          <dt>Homeserver</dt>
          <dd>{session.homeserver}</dd>
        </dl>
        <form className="profile__form" onSubmit={handleSave}>
          <label>
            Display name
            <input
              value={displayName}
              disabled={!loaded}
              maxLength={64}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={!loaded || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
        <button type="button" className="button button--danger" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </Dialog>
  );
}

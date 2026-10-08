import { localpart } from "../matrix/ids";
import { Avatar } from "./Avatar";
import { useSession } from "./session-context";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export function UserBar({ onOpenProfile, onOpenSettings }: Props) {
  const { session } = useSession();
  return (
    <div className="user-bar">
      <button type="button" className="user-bar__me" onClick={onOpenProfile} title="Profile">
        <Avatar id={session.userId} name={localpart(session.userId)} size={28} />
        <span className="user-bar__name">{localpart(session.userId)}</span>
      </button>
      <ThemeToggle />
      <button
        type="button"
        className="icon-button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        ⚙
      </button>
    </div>
  );
}

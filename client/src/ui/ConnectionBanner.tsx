import { useSelector } from "../store/react";

export function ConnectionBanner() {
  const status = useSelector((s) => s.syncStatus);
  const error = useSelector((s) => s.syncError);
  if (status !== "reconnecting") return null;
  return (
    <div className="banner banner--warning" role="alert">
      Connection lost. Reconnecting…{error ? <span className="banner__detail"> ({error})</span> : null}
    </div>
  );
}

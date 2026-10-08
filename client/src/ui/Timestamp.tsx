import { useRelativeTime } from "../hooks/time";
import { useSetting } from "../settings/settings";
import { formatDateTime, formatTime } from "../utils/format";

export function Timestamp({ ts, variant = "relative" }: { ts: number; variant?: "relative" | "clock" }) {
  const relative = useRelativeTime(ts);
  const clock24h = useSetting("clock24h");
  return (
    <time className="timestamp" dateTime={new Date(ts).toISOString()} title={formatDateTime(ts)}>
      {variant === "clock" ? formatTime(ts, !clock24h) : relative}
    </time>
  );
}

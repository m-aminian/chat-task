const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDay(ts: number, now: number = Date.now()): string {
  const key = dayKey(ts);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - 86_400_000)) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(ts: number, hour12: boolean): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12 });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const UNITS = [
  { limit: 60, divisor: 1, unit: "s" },
  { limit: 3_600, divisor: 60, unit: "m" },
  { limit: 86_400, divisor: 3_600, unit: "h" },
  { limit: 604_800, divisor: 86_400, unit: "d" },
] as const;

export function formatRelative(ts: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 45) return "now";
  for (const { limit, divisor, unit } of UNITS) {
    if (seconds < limit) return `${Math.floor(seconds / divisor)}${unit}`;
  }
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.floor(n / 1000)}k`;
}

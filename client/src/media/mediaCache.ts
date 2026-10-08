import type { Session } from "../matrix/api";
import { mediaUrl } from "../matrix/media";
import { LruCache } from "../utils/lru";

export interface MediaEntry {
  src?: string;
  width?: number;
  height?: number;
}

const THUMBNAIL = { width: 800, height: 600 } as const;
const entries = new LruCache<string, MediaEntry>(3_000);
const inflight = new Map<string, Promise<MediaEntry>>();

export function resolveMedia(mxc: string): MediaEntry {
  const existing = entries.get(mxc);
  if (existing) return existing;
  const entry: MediaEntry = {};
  entries.set(mxc, entry);
  return entry;
}

export function loadMedia(session: Session, mxc: string): Promise<MediaEntry> {
  const cached = entries.get(mxc);
  if (cached?.src) return Promise.resolve(cached);
  const pending = inflight.get(mxc);
  if (pending) return pending;
  const request = fetch(mediaUrl(session.homeserver, mxc, THUMBNAIL), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Media request failed with ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const entry: MediaEntry = { ...entries.get(mxc), src: URL.createObjectURL(blob) };
      entries.set(mxc, entry);
      return entry;
    })
    .finally(() => inflight.delete(mxc));
  inflight.set(mxc, request);
  return request;
}

export function rememberSize(mxc: string, width: number, height: number): void {
  const entry = entries.get(mxc);
  if (!entry || (entry.width === width && entry.height === height)) return;
  entries.set(mxc, { ...entry, width, height });
}

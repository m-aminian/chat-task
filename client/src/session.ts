import { z } from "zod";
import type { Session } from "./matrix/api";
import { userIdSchema } from "./matrix/ids";

const STORAGE_KEY = "chat.session";

const sessionSchema = z.object({
  homeserver: z.string().url(),
  userId: userIdSchema,
  accessToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const DEFAULT_HOMESERVER = "http://localhost:8008";

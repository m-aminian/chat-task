import { useSyncExternalStore } from "react";
import { z } from "zod";
import { createStore } from "../store/store";
import { debounce } from "../utils/debounce";

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

const settingsSchema = z.object({
  theme: z.enum(THEMES).catch("system"),
  density: z.enum(DENSITIES).catch("comfortable"),
  clock24h: z.boolean().catch(true),
  enterToSend: z.boolean().catch(true),
  showImages: z.boolean().catch(true),
  showTyping: z.boolean().catch(true),
  sendReadReceipts: z.boolean().catch(true),
  reduceMotion: z.boolean().catch(false),
});

export type Settings = z.infer<typeof settingsSchema>;
export type Theme = Settings["theme"];

const STORAGE_KEY = "chat.settings";

function load(): Settings {
  try {
    return settingsSchema.parse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return settingsSchema.parse({});
  }
}

export const settingsStore = createStore<Settings>(load());

const persist = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore.getState()));
  } catch {}
}, 300);

settingsStore.subscribe(persist);
window.addEventListener("pagehide", () => persist.flush());

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.setState((s) => ({ ...s, ...patch }));
}

export function resetSettings(): void {
  settingsStore.setState(() => settingsSchema.parse({}));
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(settingsStore.subscribe, () => settingsStore.getState()[key]);
}

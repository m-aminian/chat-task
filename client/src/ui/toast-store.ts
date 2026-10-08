import { useSyncExternalStore } from "react";
import { createStore } from "../store/store";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

const toastStore = createStore<Toast[]>([]);
let nextId = 1;

export function showToast(message: string, tone: Toast["tone"] = "info", durationMs = 4_000): void {
  const id = nextId++;
  toastStore.setState((list) => [...list.slice(-3), { id, message, tone }]);
  setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: number): void {
  toastStore.setState((list) => (list.some((t) => t.id === id) ? list.filter((t) => t.id !== id) : list));
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getState);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

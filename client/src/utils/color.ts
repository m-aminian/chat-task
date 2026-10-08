const PALETTE = [
  "#c2410c",
  "#b45309",
  "#4d7c0f",
  "#047857",
  "#0e7490",
  "#1d4ed8",
  "#6d28d9",
  "#a21caf",
  "#be123c",
] as const;

export function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function userColor(userId: string): string {
  return PALETTE[hashString(userId) % PALETTE.length]!;
}

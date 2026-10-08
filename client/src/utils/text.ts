export function initials(name: string): string {
  const cleaned = name.replace(/^[@#!]/, "").split(":")[0] ?? "";
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? [...parts[0]!].slice(0, 2) : [[...parts[0]!][0], [...parts[1]!][0]];
  return letters.join("").toUpperCase();
}

export function truncate(value: string, max: number): string {
  const chars = [...value];
  return chars.length <= max ? value : `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}

export function firstLine(value: string): string {
  const line = value.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.replace(/^[#>*\-\s`|]+/, "").trim();
}

export function looksLikeMarkdown(value: string): boolean {
  return /[*_`#>|[\]~]|^\s*[-+]\s|^\s*\d+\.\s|\n/m.test(value);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function joinNames(names: readonly string[], max = 3): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max - 1).join(", ")} and ${names.length - (max - 1)} others`;
}

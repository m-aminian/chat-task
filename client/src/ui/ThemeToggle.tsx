import { THEMES, updateSettings, useSetting, type Theme } from "../settings/settings";

const LABELS: Record<Theme, string> = { system: "◐", light: "☀", dark: "☾" };

export function ThemeToggle() {
  const theme = useSetting("theme");
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  return (
    <button
      type="button"
      className="icon-button"
      title={`Theme: ${theme}. Switch to ${next}.`}
      aria-label={`Theme: ${theme}`}
      onClick={() => updateSettings({ theme: next })}
    >
      {LABELS[theme]}
    </button>
  );
}

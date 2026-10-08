import { useEffect } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSetting } from "../settings/settings";

export function useThemeEffect(): void {
  const theme = useSetting("theme");
  const density = useSetting("density");
  const reduceMotion = useSetting("reduceMotion");
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.density = density;
    root.dataset.motion = reduceMotion ? "reduced" : "full";
    root.style.colorScheme = resolved;
  }, [resolved, density, reduceMotion]);
}

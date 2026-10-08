import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSettings, settingsStore } from "../settings/settings";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => resetSettings());

  it("cycles system, light and dark", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName("Theme: system");
    fireEvent.click(button);
    expect(settingsStore.getState().theme).toBe("light");
    fireEvent.click(button);
    expect(settingsStore.getState().theme).toBe("dark");
    fireEvent.click(button);
    expect(settingsStore.getState().theme).toBe("system");
  });
});

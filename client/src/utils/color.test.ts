import { describe, expect, it } from "vitest";
import { hashString, userColor } from "./color";

describe("userColor", () => {
  it("is stable for the same id", () => {
    expect(userColor("@alice:localhost")).toBe(userColor("@alice:localhost"));
  });

  it("returns a hex colour", () => {
    expect(userColor("@bob:localhost")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("spreads ids across the palette", () => {
    const colours = new Set(Array.from({ length: 50 }, (_, i) => userColor(`@user${i}:localhost`)));
    expect(colours.size).toBeGreaterThan(5);
  });

  it("hashes to a non-negative integer", () => {
    expect(hashString("")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashString("anything"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { dayKey, formatBytes, formatCount, formatDay, formatRelative } from "./format";

const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

describe("formatRelative", () => {
  it.each([
    [0, "now"],
    [30_000, "now"],
    [90_000, "1m"],
    [59 * 60_000, "59m"],
    [3 * 3_600_000, "3h"],
    [2 * 86_400_000, "2d"],
  ])("%i ms ago -> %s", (ago, expected) => {
    expect(formatRelative(now - ago, now)).toBe(expected);
  });

  it("never returns a negative age for clock skew", () => {
    expect(formatRelative(now + 60_000, now)).toBe("now");
  });

  it("falls back to a date after a week", () => {
    expect(formatRelative(now - 10 * 86_400_000, now)).not.toMatch(/^\d+[smhd]$/);
  });
});

describe("formatDay", () => {
  it("names today and yesterday", () => {
    expect(formatDay(now, now)).toBe("Today");
    expect(formatDay(now - 86_400_000, now)).toBe("Yesterday");
  });

  it("uses the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 2, 23, 59).getTime())).toBe("2026-01-02");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1536, "1.5 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [300 * 1024 * 1024, "300 MB"],
  ])("%i -> %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("returns an empty string for invalid input", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});

describe("formatCount", () => {
  it("abbreviates thousands", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1250)).toBe("1.3k");
    expect(formatCount(25_400)).toBe("25k");
  });
});

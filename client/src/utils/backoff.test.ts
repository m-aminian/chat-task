import { describe, expect, it } from "vitest";
import { Backoff } from "./backoff";

describe("Backoff", () => {
  it("doubles until the cap", () => {
    const backoff = new Backoff({ baseMs: 100, maxMs: 1_000, jitter: 0 });
    expect([1, 2, 3, 4, 5, 6].map(() => backoff.next())).toEqual([100, 200, 400, 800, 1000, 1000]);
  });

  it("applies jitter within the configured share", () => {
    const low = new Backoff({ baseMs: 1_000, maxMs: 10_000, jitter: 0.5 }, () => 0);
    const high = new Backoff({ baseMs: 1_000, maxMs: 10_000, jitter: 0.5 }, () => 1);
    expect(low.next()).toBe(500);
    expect(high.next()).toBe(1_000);
  });

  it("starts over after reset", () => {
    const backoff = new Backoff({ baseMs: 100, maxMs: 1_000, jitter: 0 });
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.attempts).toBe(0);
    expect(backoff.next()).toBe(100);
  });
});

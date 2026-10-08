import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import { PASSWORD, roomAlias } from "./config.js";
import { MatrixClient } from "./matrix.js";
import { sleep } from "./pool.js";

export const CLIENT_URL = (process.env.CLIENT_URL ?? "http://localhost:5173").replace(/\/$/, "");

export interface ClientPage {
  browser: Browser;
  page: Page;
  cdp: CDPSession;
  errors: string[];
}

const PAGE_HELPERS = `
  // tsx compiles with keepNames, which wraps functions passed to page.evaluate in __name().
  globalThis.__name = (fn) => fn;
  globalThis.__findTimelineScroller = () => {
    const explicit = document.querySelector("[data-timeline], .timeline");
    if (explicit && explicit.scrollHeight > explicit.clientHeight) return explicit;
    let best = null;
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 10) continue;
      if (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth) best = el;
    }
    return best;
  };
`;

export async function openClient(username = "alice", opts: { headless?: boolean } = {}): Promise<ClientPage> {
  const browser = await chromium.launch({ headless: opts.headless ?? process.env.HEADED !== "1" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.addInitScript(PAGE_HELPERS);
  await page.goto(CLIENT_URL);
  const password = page.locator('input[type="password"]');
  if (await password.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const username_ = page
      .locator('input[autocomplete="username"], input[name="username"], input[type="text"]')
      .first();
    await username_.fill(username);
    await password.fill(PASSWORD);
    await password.press("Enter");
  }
  await page.waitForFunction(
    () => {
      const t = (window as unknown as { __timeline?: Record<string, unknown> }).__timeline;
      return t !== undefined && Object.keys(t).length > 0;
    },
    undefined,
    { timeout: 60_000 },
  );
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp, errors };
}

const roomIdCache = new Map<string, string>();

export async function resolveRoomId(name: string): Promise<string> {
  const cached = roomIdCache.get(name);
  if (cached) return cached;
  const client = await MatrixClient.login("alice", "TOOLS");
  const roomId = await client.resolveAlias(roomAlias(name));
  if (!roomId) throw new Error(`Room ${roomAlias(name)} not found. Did you run make up?`);
  roomIdCache.set(name, roomId);
  return roomId;
}

export async function openRoom(page: Page, name: string): Promise<void> {
  const exact = new RegExp(`^\\s*#?${name}\\s*$`);
  const candidates = [
    page.locator(".room-item__name", { hasText: exact }),
    page.getByRole("button", { name: new RegExp(`^#?${name}\\b`) }),
    page.getByRole("link", { name: new RegExp(`^#?${name}\\b`) }),
    page.getByText(exact),
  ];
  for (const candidate of candidates) {
    const first = candidate.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  throw new Error(`Could not find room "${name}" in the room list`);
}

export interface TimelineSnapshot {
  order: string[];
  bodies: Record<string, string | null>;
}

export async function readTimeline(page: Page, roomId: string): Promise<TimelineSnapshot | null> {
  return page.evaluate((id) => {
    const snapshot = (window as unknown as { __timeline?: Record<string, TimelineSnapshot> }).__timeline?.[
      id
    ];
    if (!snapshot) return null;
    return { order: [...snapshot.order], bodies: { ...snapshot.bodies } };
  }, roomId);
}

export async function loadedCount(page: Page, roomId: string): Promise<number> {
  return page.evaluate((id) => {
    const snapshot = (window as unknown as { __timeline?: Record<string, { order: string[] }> }).__timeline;
    return snapshot?.[id]?.order.length ?? 0;
  }, roomId);
}

export function scrollTimeline(page: Page, to: "top" | "bottom"): Promise<void> {
  return page.evaluate((where) => {
    const el = (
      globalThis as unknown as { __findTimelineScroller(): HTMLElement | null }
    ).__findTimelineScroller();
    if (el) el.scrollTop = where === "top" ? 0 : el.scrollHeight;
  }, to);
}

export interface LoadResult {
  rows: number;
  stalled: boolean;
  timedOut: boolean;
}

export async function loadHistory(
  page: Page,
  roomId: string,
  target: number,
  opts: { timeoutMs?: number; onProgress?: (rows: number) => void } = {},
): Promise<LoadResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let rows = await loadedCount(page, roomId);
  let stalls = 0;
  let lastReport = rows;

  while (rows < target) {
    if (Date.now() > deadline) return { rows, stalled: false, timedOut: true };
    const step = page.evaluate(
      async ({ id, waitMs }) => {
        const count = () =>
          (window as unknown as { __timeline?: Record<string, { order: string[] }> }).__timeline?.[id]?.order
            .length ?? 0;
        const find = (globalThis as unknown as { __findTimelineScroller(): HTMLElement | null })
          .__findTimelineScroller;
        const before = count();
        const started = performance.now();
        while (performance.now() - started < waitMs) {
          const el = find();
          if (el) el.scrollTop = 0;
          await new Promise((r) => setTimeout(r, 50));
          if (count() > before) return count();
        }
        return count();
      },
      { id: roomId, waitMs: 4_000 },
    );

    const next = await Promise.race([step, sleep(60_000).then(() => -1)]);
    if (next === -1) return { rows, stalled: false, timedOut: true };

    stalls = next === rows ? stalls + 1 : 0;
    rows = next;
    if (stalls >= 3) return { rows, stalled: true, timedOut: false };
    if (opts.onProgress && rows - lastReport >= 2_000) {
      opts.onProgress(rows);
      lastReport = rows;
    }
  }
  return { rows, stalled: false, timedOut: false };
}

export async function usedHeapMb(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return usedSize / 1024 / 1024;
}

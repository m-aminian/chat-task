/**
 * Diagnostic probe for the relative-time clock leak in
 * client/src/hooks/time.ts: a shared clock used to create one setInterval
 * PER subscriber, and only cleared one when the LAST subscriber of the
 * whole app unsubscribed, abandoning every interval before that forever.
 *
 * Measures, against a running client:
 *   1. live interval count as timeline rows grow    → should stay O(1), not O(N)
 *   2. live interval count after switching rooms repeatedly → leaked intervals
 *   3. listener invocations per tick window          → wakeups per 30s
 *
 * Read-only: instruments window timers, never touches app state.
 * Run (from tools/):  pnpm exec tsx probe-timers.ts
 * See probe-timers-results.md for captured before/after results from this
 * exact script, against commit 465ef62 (before) and the fix in this
 * branch's history (after).
 */
import { chromium } from "playwright";

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";
const PASSWORD = "assignment";

const INSTRUMENT = `
  (() => {
    const realSet = window.setInterval.bind(window);
    const realClear = window.clearInterval.bind(window);
    const live = new Map();           // id -> { delay, stack }
    let created = 0, cleared = 0;

    window.setInterval = (fn, delay, ...rest) => {
      const wrapped = (...a) => { window.__probe.ticks++; return fn(...a); };
      const id = realSet(wrapped, delay, ...rest);
      created++;
      live.set(id, { delay, stack: new Error().stack });
      return id;
    };
    window.clearInterval = (id) => {
      if (live.delete(id)) cleared++;
      return realClear(id);
    };

    window.__probe = {
      ticks: 0,
      created: () => created,
      cleared: () => cleared,
      live: () => live.size,
      // only the 30s clock intervals, to separate them from app/vite timers
      liveAt: (ms) => [...live.values()].filter((e) => e.delay === ms).length,
    };
  })();
`;

async function main() {
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.addInitScript(INSTRUMENT);
  await page.addInitScript(`
    globalThis.__name = (fn) => fn;
    globalThis.__findTimelineScroller = () => {
      const explicit = document.querySelector("[data-timeline], .timeline");
      if (explicit && explicit.scrollHeight > explicit.clientHeight) return explicit;
      let best = null;
      for (const el of document.querySelectorAll("body *")) {
        const s = getComputedStyle(el);
        if (!/(auto|scroll)/.test(s.overflowY)) continue;
        if (el.scrollHeight <= el.clientHeight + 10) continue;
        if (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth) best = el;
      }
      return best;
    };
  `);

  await page.goto(CLIENT_URL);
  const password = page.locator('input[type="password"]');
  if (await password.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page
      .locator('input[autocomplete="username"], input[name="username"], input[type="text"]')
      .first()
      .fill("alice");
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

  const openRoom = async (name: string) => {
    const exact = new RegExp(`^\\s*#?${name}\\s*$`);
    for (const c of [
      page.locator(".room-item__name", { hasText: exact }),
      page.getByRole("button", { name: new RegExp(`^#?${name}\\b`) }),
      page.getByText(exact),
    ]) {
      const first = c.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click();
        await page.waitForTimeout(800);
        return;
      }
    }
    throw new Error(`room ${name} not found`);
  };

  const snap = async (label: string, roomId?: string) => {
    const s = await page.evaluate(
      ([id]) => {
        const probe = (
          window as unknown as {
            __probe: { live(): number; liveAt(ms: number): number; created(): number; cleared(): number };
          }
        ).__probe;
        const timeline = (window as unknown as { __timeline?: Record<string, { order: string[] }> })
          .__timeline;
        return {
          liveTotal: probe.live(),
          live30s: probe.liveAt(30_000),
          created: probe.created(),
          cleared: probe.cleared(),
          rows: id ? (timeline?.[id]?.order.length ?? 0) : 0,
          tiles: document.querySelectorAll("article.tile").length,
        };
      },
      [roomId ?? null],
    );
    console.log(
      `${label.padEnd(34)} rows=${String(s.rows).padStart(6)}  tiles=${String(s.tiles).padStart(6)}` +
        `  live30s=${String(s.live30s).padStart(6)}  liveTotal=${String(s.liveTotal).padStart(6)}` +
        `  created=${String(s.created).padStart(6)}  cleared=${String(s.cleared).padStart(5)}`,
    );
    return s;
  };

  const ids = await page.evaluate(
    () => Object.keys((window as unknown as { __timeline?: Record<string, unknown> }).__timeline ?? {}),
  );
  console.log(`\nrooms in __timeline: ${ids.length}\n`);
  console.log("--- 1. intervals vs. number of rendered rows ---");

  await openRoom("small");
  const smallId = await page.evaluate(() => {
    const t = (window as unknown as { __timeline?: Record<string, { order: string[] }> }).__timeline ?? {};
    const entries = Object.entries(t);
    return entries.sort((a, b) => a[1].order.length - b[1].order.length)[0]?.[0] ?? null;
  });
  await snap("after opening #small", smallId ?? undefined);

  await openRoom("medium");
  const mediumId = await page.evaluate(() => {
    const t = (window as unknown as { __timeline?: Record<string, { order: string[] }> }).__timeline ?? {};
    const entries = Object.entries(t);
    return entries.sort((a, b) => b[1].order.length - a[1].order.length)[0]?.[0] ?? null;
  });
  await snap("after opening #medium", mediumId ?? undefined);

  // grow the timeline by paginating upward
  for (let i = 0; i < 6; i++) {
    await page.evaluate(async () => {
      const el = (
        globalThis as unknown as { __findTimelineScroller(): HTMLElement | null }
      ).__findTimelineScroller();
      for (let n = 0; n < 40; n++) {
        if (el) el.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await snap(`#medium after scroll-up round ${i + 1}`, mediumId ?? undefined);
  }

  console.log("\n--- 2. leak check: switch rooms repeatedly ---");
  for (let i = 0; i < 4; i++) {
    await openRoom("small");
    await openRoom("medium");
    await snap(`after room-switch cycle ${i + 1}`, mediumId ?? undefined);
  }

  console.log("\n--- 3. listener invocations per 30s tick window ---");
  await page.evaluate(() => {
    (window as unknown as { __probe: { ticks: number } }).__probe.ticks = 0;
  });
  await page.waitForTimeout(32_000);
  const ticks = await page.evaluate(() => (window as unknown as { __probe: { ticks: number } }).__probe.ticks);
  const final = await snap("final", mediumId ?? undefined);
  console.log(
    `\ninterval callbacks fired in one 30s window: ${ticks}` + `  (live 30s intervals: ${final.live30s})`,
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

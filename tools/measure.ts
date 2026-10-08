import {
  loadHistory,
  loadedCount,
  openClient,
  openRoom,
  resolveRoomId,
  scrollTimeline,
  usedHeapMb,
} from "./lib/browser.js";

const which = new Set(process.argv.slice(2));
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 4);
const run = (name: string) => (which.size === 0 && name !== "soak") || which.has(name);
const results: Record<string, unknown> = {};

const { browser, page, cdp, errors } = await openClient();
await cdp.send("Performance.enable");

try {
  if (run("fps")) {
    const roomId = await resolveRoomId("big");
    await openRoom(page, "big");
    const target = Number(process.env.FPS_ROWS ?? 3_000);
    console.log(`fps: loading ${target} rows of #big…`);
    const { rows: loaded } = await loadHistory(page, roomId, target, {
      onProgress: (rows) => console.log(`  loaded ${rows} rows`),
    });

    await scrollTimeline(page, "bottom");
    await page.waitForTimeout(1_000);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
    const stats = await page.evaluate(
      ({ durationMs, pxPerFrame }) =>
        new Promise<{
          frames: number;
          avgFps: number;
          p95FrameMs: number;
          slowFrames: number;
          scrolledPx: number;
        }>((resolve) => {
          const el = (
            globalThis as unknown as { __findTimelineScroller(): HTMLElement }
          ).__findTimelineScroller();
          const times: number[] = [];
          const start = performance.now();
          const startTop = el.scrollTop;
          let last = start;
          const step = (now: number) => {
            times.push(now - last);
            last = now;
            el.scrollTop -= pxPerFrame;
            if (now - start < durationMs) {
              requestAnimationFrame(step);
              return;
            }
            const sorted = [...times].sort((a, b) => a - b);
            resolve({
              frames: times.length,
              avgFps: Math.round((times.length / (now - start)) * 1000 * 10) / 10,
              p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10,
              slowFrames: times.filter((t) => t > 33.4).length,
              scrolledPx: Math.round(startTop - el.scrollTop),
            });
          };
          requestAnimationFrame(step);
        }),
      { durationMs: 10_000, pxPerFrame: 40 },
    );
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    results.fps = { loadedRows: loaded, cpuThrottle: THROTTLE, ...stats };
    console.log("fps:", results.fps);
  }

  if (run("heap")) {
    const roomId = await resolveRoomId("medium");
    await openRoom(page, "medium");
    console.log("heap: loading all of #medium…");
    const { rows: loaded } = await loadHistory(page, roomId, Number.POSITIVE_INFINITY);
    const scrollEnds = async (rounds: number) => {
      for (let i = 0; i < rounds; i++) {
        for (const end of ["top", "bottom"] as const) {
          await page.evaluate(async (to) => {
            const el = (
              globalThis as unknown as { __findTimelineScroller(): HTMLElement }
            ).__findTimelineScroller();
            const goal = to === "top" ? 0 : el.scrollHeight;
            for (let n = 0; n < 400; n++) {
              const before = el.scrollTop;
              el.scrollTop += to === "top" ? -2_000 : 2_000;
              await new Promise((r) => requestAnimationFrame(r));
              if (el.scrollTop === before || (to === "top" && el.scrollTop <= goal)) break;
            }
          }, end);
        }
      }
    };
    await scrollEnds(1);
    const before = await usedHeapMb(cdp);
    const samples: number[] = [];
    for (let round = 0; round < 10; round++) {
      await scrollEnds(1);
      samples.push(Math.round((await usedHeapMb(cdp)) * 10) / 10);
    }
    const after = samples[samples.length - 1]!;
    results.heap = {
      loadedRows: loaded,
      totalRowsAfter: await loadedCount(page, roomId),
      beforeMb: Math.round(before * 10) / 10,
      afterMb: after,
      growthMb: Math.round((after - before) * 10) / 10,
      samples,
    };
    console.log("heap:", results.heap);
  }
  if (run("soak")) {
    const minutes = Number(process.env.SOAK_MINUTES ?? 5);
    await openRoom(page, "big");
    const samples: { atS: number; usedMb: number; afterGcMb: number }[] = [];
    const started = Date.now();
    console.log(`soak: ${minutes} min in #big, switching rooms every minute`);
    for (let tick = 1; tick <= minutes * 2; tick++) {
      await page.waitForTimeout(30_000);
      if (tick % 2 === 0) {
        await openRoom(page, "medium");
        await page.waitForTimeout(3_000);
        await openRoom(page, "big");
      }
      const metrics = await cdp.send("Performance.getMetrics").catch(() => null);
      const used = metrics?.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
      const sample = {
        atS: Math.round((Date.now() - started) / 1000),
        usedMb: Math.round((used / 1024 / 1024) * 10) / 10,
        afterGcMb: Math.round((await usedHeapMb(cdp)) * 10) / 10,
      };
      samples.push(sample);
      console.log("soak:", sample);
    }
    results.soak = {
      minutes,
      peakUsedMb: Math.max(...samples.map((s) => s.usedMb)),
      finalAfterGcMb: samples[samples.length - 1]?.afterGcMb,
      samples,
    };
  }
} finally {
  results.pageErrors = errors.slice(0, 20);
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

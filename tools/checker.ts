import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Page, Route } from "playwright";
import {
  loadHistory,
  openClient,
  openRoom,
  readTimeline,
  resolveRoomId,
  scrollTimeline,
  type TimelineSnapshot,
} from "./lib/browser.js";
import { MatrixClient } from "./lib/matrix.js";
import { sleep } from "./lib/pool.js";
import { Rng } from "./lib/random.js";
import {
  compare,
  expectedRows,
  extendHistory,
  fetchHistory,
  type Comparison,
  type RawEvent,
  type TruthRow,
} from "./lib/truth.js";

const { values: args } = parseArgs({
  options: {
    rooms: { type: "string", default: "small,medium,big" },
    soak: { type: "string", default: "0" },
    "with-chaos": { type: "boolean", default: false },
    "chaos-intensity": { type: "string", default: "normal" },
    "no-faults": { type: "boolean", default: false },
    "max-rows": { type: "string", default: "Infinity" },
    "room-timeout": { type: "string", default: "900" },
    json: { type: "string" },
  },
});

const roomNames = args
  .rooms!.split(",")
  .map((r) => r.trim())
  .filter(Boolean);
const soakMinutes = Number(args.soak);
const maxRows = Number(args["max-rows"]);
const roomTimeoutMs = Number(args["room-timeout"]) * 1000;
const faults = soakMinutes > 0 && !args["no-faults"];
const runId = Date.now().toString(36);

const t0 = Date.now();
const elapsed = () => `${Math.round((Date.now() - t0) / 1000)}s`;
const say = (msg: string) => console.log(`[${elapsed().padStart(5)}] ${msg}`);

interface SentMessage {
  room: string;
  body: string;
}

interface RoomReport {
  room: string;
  roomId: string;
  rows: number;
  fullHistory: boolean;
  historyNote: string | null;
  comparison: Comparison | null;
  sent: { body: string; shown: number; stored: number }[];
  issues: string[];
}

async function installFaults(page: Page) {
  const rng = new Rng(Date.now() % 100_000);
  let sends = 0;
  const stats = { delayedSendResponses: 0, droppedSendResponses: 0, failedSyncs: 0 };

  await page.route(/\/_matrix\/client\/v3\/rooms\/[^/]+\/send\/m\.room\.message\//, async (route: Route) => {
    sends++;
    if (sends % 3 === 1) return route.continue();
    if (sends % 3 === 2) {
      const response = await route.fetch();
      stats.delayedSendResponses++;
      await sleep(2_000);
      return route.fulfill({ response });
    }

    await route.fetch().catch(() => undefined);
    stats.droppedSendResponses++;
    return route.abort("failed");
  });

  await page.route(/\/_matrix\/client\/v3\/sync\?/, async (route: Route) => {
    if (route.request().url().includes("since=") && rng.chance(0.08)) {
      stats.failedSyncs++;
      return route.abort("failed");
    }
    return route.continue();
  });
  return stats;
}

async function sendThroughComposer(page: Page, body: string): Promise<boolean> {
  const composer = page.locator('textarea, [contenteditable="true"]').last();
  if (!(await composer.isVisible().catch(() => false))) return false;
  await composer.click();
  await composer.fill(body);
  await composer.press("Enter");
  return true;
}

function startChaos(): ChildProcess {
  return spawn("npx", ["tsx", "chaos-bot.ts", "--intensity", args["chaos-intensity"]!], {
    cwd: new URL(".", import.meta.url).pathname,
    stdio: "ignore",
  });
}

async function stopChaos(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.on("exit", resolve));
  child.kill("SIGINT");
  await Promise.race([exited, sleep(10_000)]);
}

async function soak(page: Page): Promise<SentMessage[]> {
  const sent: SentMessage[] = [];
  const stats = faults ? await installFaults(page) : null;
  const chaos = args["with-chaos"] ? startChaos() : null;
  say(
    `soak: ${soakMinutes} min${chaos ? `, chaos bot (${args["chaos-intensity"]})` : ""}` +
      `${faults ? ", network faults on" : ""}`,
  );

  const end = Date.now() + soakMinutes * 60_000;
  let tick = 0;
  let current = roomNames[0]!;
  try {
    while (Date.now() < end) {
      if (tick % 4 === 0) {
        current = roomNames[(tick / 4) % roomNames.length]!;
        await openRoom(page, current);
        await scrollTimeline(page, "bottom");
      }
      const body = `checker ${runId} ${sent.length + 1}`;
      if (await sendThroughComposer(page, body)) sent.push({ room: current, body });
      tick++;
      await page.waitForTimeout(5_000);
      if (tick % 12 === 0)
        say(`soak: ${sent.length} messages sent${stats ? `, faults ${JSON.stringify(stats)}` : ""}`);
    }
  } finally {
    if (chaos) await stopChaos(chaos);
    if (faults) await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  say(
    `soak done: ${sent.length} messages sent${stats ? `, ${JSON.stringify(stats)}` : ""}; letting the client settle`,
  );
  await page.waitForTimeout(10_000);
  return sent;
}

async function waitForCatchUp(page: Page, roomId: string, truth: TruthRow[]): Promise<void> {
  const newest = truth[truth.length - 1]?.eventId;
  if (!newest) return;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const snapshot = await readTimeline(page, roomId);
    if (snapshot?.order.includes(newest)) return;
    await sleep(250);
  }
}

function countBodies(snapshot: TimelineSnapshot, body: string): number {
  return snapshot.order.filter((id) => snapshot.bodies[id] === body).length;
}

async function checkRoom(
  page: Page,
  admin: MatrixClient,
  room: string,
  sent: SentMessage[],
): Promise<RoomReport> {
  const roomId = await resolveRoomId(room);
  const report: RoomReport = {
    room,
    roomId,
    rows: 0,
    fullHistory: false,
    historyNote: null,
    comparison: null,
    sent: [],
    issues: [],
  };

  await openRoom(page, room);
  say(`#${room}: loading history${Number.isFinite(maxRows) ? ` (up to ${maxRows} rows)` : ""}…`);
  const load = await loadHistory(page, roomId, maxRows, {
    timeoutMs: roomTimeoutMs,
    onProgress: (rows) => say(`#${room}: ${rows} rows loaded`),
  });
  if (load.timedOut) report.historyNote = `history loading timed out after ${load.rows} rows`;

  await scrollTimeline(page, "bottom");
  await page.waitForTimeout(1_000);

  const oldestOf = (snap: TimelineSnapshot | null) => snap?.order.find((id) => !id.startsWith("~"));
  say(`#${room}: reading ground truth from Synapse…`);
  let oldest = oldestOf(await readTimeline(page, roomId));
  let bulk = await fetchHistory(admin, roomId, oldest ? { until: oldest } : {});
  const newer = async (events: RawEvent[]) =>
    extendHistory(
      events,
      (await fetchHistory(admin, roomId, { newerThan: events[events.length - 1]?.event_id })).events,
    );
  let beforeRaw = await newer(bulk.events);
  let before = expectedRows(beforeRaw);
  await waitForCatchUp(page, roomId, before);
  let snapshot = await readTimeline(page, roomId);

  const snapshotOldest = oldestOf(snapshot);
  if (
    snapshotOldest &&
    snapshotOldest !== oldest &&
    !bulk.complete &&
    !beforeRaw.some((e) => e.event_id === snapshotOldest)
  ) {
    oldest = snapshotOldest;
    bulk = await fetchHistory(admin, roomId, { until: oldest });
    beforeRaw = await newer(bulk.events);
    before = expectedRows(beforeRaw);
    snapshot = await readTimeline(page, roomId);
  }
  const after = expectedRows(await newer(beforeRaw));

  if (!snapshot || !Array.isArray(snapshot.order) || typeof snapshot.bodies !== "object") {
    report.issues.push("window.__timeline has no entry for this room");
    return report;
  }

  const c = compare(before, snapshot, after, bulk.complete);
  report.comparison = c;
  report.rows = c.loaded;
  report.fullHistory = c.fullHistory;
  if (!c.fullHistory && !Number.isFinite(maxRows) && !report.historyNote) {
    report.historyNote = `history incomplete: ${c.loaded} of ${before.length} rows loaded`;
  }
  if (report.historyNote && !Number.isFinite(maxRows)) report.issues.push(report.historyNote);

  for (const { eventId, count } of c.duplicates)
    report.issues.push(`duplicate     ${eventId} shown ${count} times`);
  if (c.missing.length > 0) {
    const sample = c.missing
      .slice(0, 3)
      .map((m) => `${m.eventId} "${preview(m.body)}"`)
      .join(", ");
    report.issues.push(`missing       ${c.missing.length} events, e.g. ${sample}`);
  }
  for (const id of c.unexpected.slice(0, 5))
    report.issues.push(`unexpected    ${id} is not in the room's history`);
  if (c.unexpected.length > 5) report.issues.push(`unexpected    … and ${c.unexpected.length - 5} more`);
  for (const w of c.wrongEdit.slice(0, 5)) {
    report.issues.push(
      `wrong body    ${w.eventId} shows "${preview(w.actual)}", expected "${preview(w.expected)}"`,
    );
  }
  if (c.wrongEdit.length > 5) report.issues.push(`wrong body    … and ${c.wrongEdit.length - 5} more`);
  for (const r of c.redactedWithContent.slice(0, 5)) {
    report.issues.push(`redacted      ${r.eventId} still shows "${preview(r.actual)}"`);
  }
  for (const echo of c.localEchoes)
    report.issues.push(`local echo    "${preview(echo.body)}" never confirmed by the server`);

  for (const { body } of sent.filter((s) => s.room === room)) {
    const shown = countBodies(snapshot, body);
    const stored = after.filter((row) => row.body === body).length;
    report.sent.push({ body, shown, stored });
    if (stored > 1) report.issues.push(`sent twice    "${body}" stored ${stored} times on the server`);
    if (shown > 1) report.issues.push(`shown twice   "${body}" shown ${shown} times`);
    if (shown === 0 && stored > 0) report.issues.push(`not shown     "${body}" was sent but is not visible`);
  }
  return report;
}

function preview(text: string | null): string {
  if (text === null) return "<redacted>";
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 50 ? `${line.slice(0, 49)}…` : line;
}

let exitCode = 0;
let client: Awaited<ReturnType<typeof openClient>> | null = null;
try {
  const admin = await MatrixClient.login("admin", "CHECKER");
  say("opening the client as alice");
  client = await openClient("alice");
  const sent = soakMinutes > 0 ? await soak(client.page) : [];

  const reports: RoomReport[] = [];
  for (const room of roomNames) reports.push(await checkRoom(client.page, admin, room, sent));

  console.log("");
  let total = 0;
  for (const r of reports) {
    total += r.issues.length;
    const scope = r.fullHistory ? "full history" : `newest ${r.rows} rows`;
    const status =
      r.issues.length === 0 ? "CLEAN" : `${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}`;
    console.log(`#${r.room.padEnd(7)} ${String(r.rows).padStart(6)} rows (${scope})  ${status}`);
    for (const issue of r.issues) console.log(`    ${issue}`);
  }

  const pageErrors = client.errors.filter(
    (e) => !/The above error occurred|Failed to render event|net::ERR_FAILED/.test(e),
  );
  if (pageErrors.length > 0) {
    console.log(`\npage errors (${pageErrors.length}, informational):`);
    for (const e of pageErrors.slice(0, 5)) console.log(`    ${e.split("\n")[0]}`);
  }
  console.log(`\n${total === 0 ? "CLEAN" : `${total} issue${total === 1 ? "" : "s"} found`} in ${elapsed()}`);

  if (args.json) {
    writeFileSync(
      args.json,
      JSON.stringify(
        {
          runId,
          soakMinutes,
          faults,
          reports: reports.map(({ comparison, ...rest }) => ({
            ...rest,
            counts: comparison && {
              expected: comparison.expected,
              loaded: comparison.loaded,
              duplicates: comparison.duplicates.length,
              missing: comparison.missing.length,
              unexpected: comparison.unexpected.length,
              wrongEdit: comparison.wrongEdit.length,
              redactedWithContent: comparison.redactedWithContent.length,
              localEchoes: comparison.localEchoes.length,
            },
            details: comparison,
          })),
          pageErrors,
        },
        null,
        2,
      ),
    );
  }
  exitCode = total === 0 ? 0 : 1;
} catch (err) {
  console.error(`checker could not run: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 2;
} finally {
  await client?.browser.close();
}
process.exit(exitCode);

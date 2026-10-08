import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { COMMON_REACTIONS, longText, markdownTable, shortText } from "./lib/content.js";
import { roomAlias } from "./lib/config.js";
import { MatrixClient } from "./lib/matrix.js";
import { generateImage } from "./lib/png.js";
import { mapLimit, sleep } from "./lib/pool.js";
import { Rng } from "./lib/random.js";

const INTENSITIES = {
  low: {
    rate: 1,
    burstEvery: 60,
    burstSize: 60,
    editEvery: 6,
    redactEvery: 20,
    reactEvery: 4,
    imageEvery: 30,
  },
  normal: {
    rate: 5,
    burstEvery: 30,
    burstSize: 60,
    editEvery: 3,
    redactEvery: 10,
    reactEvery: 2,
    imageEvery: 10,
  },
  high: {
    rate: 15,
    burstEvery: 15,
    burstSize: 120,
    editEvery: 1,
    redactEvery: 4,
    reactEvery: 1,
    imageEvery: 4,
  },
} as const;
type Intensity = keyof typeof INTENSITIES;

const { values: args } = parseArgs({
  options: {
    intensity: { type: "string", default: process.env.CHAOS_INTENSITY ?? "normal" },
    rooms: { type: "string", default: "big,medium" },
    duration: { type: "string", default: "0" },
    "malformed-after": { type: "string", default: "20" },
    "no-malformed": { type: "boolean", default: false },
    seed: { type: "string", default: String(Date.now() % 1_000_000) },
  },
});

if (!(args.intensity! in INTENSITIES)) {
  console.error(`Unknown intensity "${args.intensity}". Use one of: ${Object.keys(INTENSITIES).join(", ")}`);
  process.exit(1);
}
const profile = INTENSITIES[args.intensity as Intensity];
const durationS = Number(args.duration);
const rng = new Rng(Number(args.seed));
const runId = `${Date.now().toString(36)}`;
const logFile = process.env.CHAOS_LOG;

const MALFORMED: { name: string; content: (target: string) => Record<string, unknown> }[] = [
  {
    name: "variant-1",
    content: (target) => ({
      msgtype: "m.text",
      body: "* 42",
      "m.new_content": { msgtype: "m.text", body: 42 },
      "m.relates_to": { rel_type: "m.replace", event_id: target },
    }),
  },
  {
    name: "variant-2",
    content: () => ({
      msgtype: "m.text",
      body: "replying to something",
      "m.relates_to": { "m.in_reply_to": "oops" },
    }),
  },
  { name: "variant-3", content: () => ({ msgtype: "m.image", body: "IMG_2041.png", url: 42 }) },
  {
    name: "variant-4",
    content: () => ({
      msgtype: "m.image",
      body: "IMG_2042.png",
      url: "https://example.org/IMG_2042.png",
      info: { mimetype: "image/png" },
    }),
  },
  {
    name: "variant-5",
    content: () => ({
      msgtype: "m.image",
      body: "IMG_2043.png",
      url: "mxc://localhost/doesnotexist",
      info: "large",
    }),
  },
];

const counts: Record<string, number> = {};
let txnCounter = 0;
const txn = () => `chaos-${runId}-${++txnCounter}`;
const started = Date.now();

function log(room: string, action: string, detail = "", data: Record<string, unknown> = {}) {
  counts[action] = (counts[action] ?? 0) + 1;
  const time = new Date().toISOString().slice(11, 23);
  console.log(`[${time}] #${room.padEnd(6)} ${action.padEnd(10)} ${detail}`);
  if (logFile)
    appendFileSync(
      logFile,
      `${JSON.stringify({ ts: new Date().toISOString(), room, action, detail, ...data })}\n`,
    );
}

function logError(room: string, action: string, err: unknown) {
  const time = new Date().toISOString().slice(11, 23);
  console.error(
    `[${time}] #${room.padEnd(6)} ${action.padEnd(10)} FAILED ${err instanceof Error ? err.message : String(err)}`,
  );
}

interface RoomState {
  name: string;
  roomId: string;

  oldMessages: string[];

  recent: string[];

  edited: string[];
}

const bot = await MatrixClient.login("chaosbot", "CHAOS");

async function prepareRoom(name: string): Promise<RoomState> {
  const roomId = await bot.resolveAlias(roomAlias(name));
  if (!roomId) throw new Error(`${roomAlias(name)} does not exist. Run make up first.`);
  await bot.join(roomId);

  const filter = JSON.stringify({ types: ["m.room.message"], senders: [bot.userId] });
  const page = await bot.request<{
    chunk: {
      event_id: string;
      content: Record<string, unknown>;
      unsigned?: { redacted_because?: unknown };
    }[];
  }>(
    "GET",
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=f&limit=300&filter=${encodeURIComponent(filter)}`,
  );
  const oldMessages = page.chunk
    .filter(
      (e) =>
        e.content.msgtype === "m.text" &&
        typeof e.content.body === "string" &&
        e.content["m.relates_to"] === undefined &&
        e.unsigned?.redacted_because === undefined,
    )
    .map((e) => e.event_id);
  return { name, roomId, oldMessages, recent: [], edited: [] };
}

const rooms = await Promise.all(args.rooms!.split(",").map((r) => prepareRoom(r.trim())));

console.log(
  `chaosbot ${bot.userId} | intensity ${args.intensity} | rooms ${rooms.map((r) => `#${r.name}`).join(", ")} | ` +
    `${profile.rate} msg/s, burst ${profile.burstSize} every ${profile.burstEvery}s | seed ${args.seed}` +
    (durationS > 0 ? ` | ${durationS}s` : " | Ctrl-C to stop"),
);
for (const room of rooms)
  console.log(`  #${room.name}: ${room.oldMessages.length} old chaosbot messages available for edits`);

function remember(room: RoomState, eventId: string) {
  room.recent.push(eventId);
  if (room.recent.length > 500) room.recent.splice(0, room.recent.length - 500);
}

function messageContent(room: RoomState): { content: Record<string, unknown>; kind: string } {
  const roll = rng.next();
  if (roll < 0.1 && room.recent.length > 0) {
    return {
      kind: "reply",
      content: {
        msgtype: "m.text",
        body: shortText(rng),
        "m.relates_to": { "m.in_reply_to": { event_id: rng.pick(room.recent.slice(-50)) } },
      },
    };
  }
  if (roll < 0.15) return { kind: "long", content: { msgtype: "m.text", body: longText(rng) } };
  if (roll < 0.17) return { kind: "table", content: { msgtype: "m.text", body: markdownTable(rng) } };
  return { kind: "text", content: { msgtype: "m.text", body: shortText(rng) } };
}

async function sendMessage(room: RoomState, quiet = false) {
  const { content, kind } = messageContent(room);
  const eventId = await bot.send(room.roomId, "m.room.message", content, txn());
  remember(room, eventId);
  if (!quiet) log(room.name, "message", `${kind} ${eventId}`, { eventId });
  return eventId;
}

const timers: ReturnType<typeof setInterval>[] = [];
function every(seconds: number, fn: () => Promise<void>, initialDelayS = seconds) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const start = setTimeout(() => {
    void run();
    timers.push(setInterval(() => void run(), seconds * 1000));
  }, initialDelayS * 1000);
  timers.push(start as unknown as ReturnType<typeof setInterval>);
}

let roundRobin = 0;
every(
  1 / profile.rate,
  async () => {
    const room = rooms[roundRobin++ % rooms.length]!;
    await sendMessage(room).catch((err) => logError(room.name, "message", err));
  },
  0.5,
);

every(2, async () => {
  await Promise.all(
    rooms.map((room) =>
      bot.setTyping(room.roomId, true, 3_000).catch((err) => logError(room.name, "typing", err)),
    ),
  );
  counts.typing = (counts.typing ?? 0) + rooms.length;
});

every(profile.burstEvery, async () => {
  for (const room of rooms) {
    const t0 = Date.now();
    let sent = 0;
    await mapLimit(Array.from({ length: profile.burstSize }), 20, async () => {
      await sendMessage(room, true)
        .then(() => sent++)
        .catch((err) => logError(room.name, "burst", err));
    });
    log(room.name, "burst", `${sent} messages in ${((Date.now() - t0) / 1000).toFixed(1)}s`, { size: sent });
  }
});

every(profile.editEvery, async () => {
  const room = rng.pick(rooms);

  const reEdit = room.edited.length > 0 && rng.chance(0.25);
  const target = reEdit
    ? rng.pick(room.edited)
    : room.oldMessages.length > 0
      ? rng.pick(room.oldMessages)
      : null;
  if (!target) return;
  const body = `${shortText(rng)} (edited ${new Date().toISOString().slice(11, 19)})`;
  try {
    const eventId = await bot.send(
      room.roomId,
      "m.room.message",
      {
        msgtype: "m.text",
        body: `* ${body}`,
        "m.new_content": { msgtype: "m.text", body },
        "m.relates_to": { rel_type: "m.replace", event_id: target },
      },
      txn(),
    );
    if (!room.edited.includes(target)) room.edited.push(target);
    log(room.name, "edit", `${reEdit ? "re-edit" : "old"} ${target} -> ${eventId}`, { target, eventId });
  } catch (err) {
    logError(room.name, "edit", err);
  }
});

every(profile.redactEvery, async () => {
  const room = rng.pick(rooms);
  if (room.edited.length === 0) return;
  const target = room.edited.splice(rng.int(0, room.edited.length - 1), 1)[0]!;
  room.oldMessages = room.oldMessages.filter((id) => id !== target);
  try {
    await bot.redact(room.roomId, target, txn());
    log(room.name, "redact", `edited message ${target}`, { target });
  } catch (err) {
    logError(room.name, "redact", err);
  }
});

const reacted = new Set<string>();
every(profile.reactEvery, async () => {
  const room = rng.pick(rooms);
  if (room.recent.length === 0) return;
  const target = rng.pick(room.recent.slice(-40));
  const key = rng.pick(COMMON_REACTIONS);
  if (reacted.has(`${target}|${key}`)) return;
  reacted.add(`${target}|${key}`);
  try {
    await bot.send(
      room.roomId,
      "m.reaction",
      { "m.relates_to": { rel_type: "m.annotation", event_id: target, key } },
      txn(),
    );
    log(room.name, "react", `${key} on ${target}`, { target, key });
  } catch (err) {
    logError(room.name, "react", err);
  }
});

let imageCounter = 0;
every(profile.imageEvery, async () => {
  const room = rng.pick(rooms);
  const img = generateImage(rng.fork(++imageCounter));
  try {
    const name = `chaos-${runId}-${imageCounter}.png`;
    const url = await bot.upload(img.data, name, "image/png");
    const eventId = await bot.send(
      room.roomId,
      "m.room.message",
      { msgtype: "m.image", body: name, url, info: { mimetype: "image/png", size: img.data.length } },
      txn(),
    );
    remember(room, eventId);
    log(room.name, "image", `${img.width}x${img.height} ${eventId}`, { eventId });
  } catch (err) {
    logError(room.name, "image", err);
  }
});

if (!args["no-malformed"]) {
  setTimeout(
    async () => {
      const room = rooms[0]!;
      const target = await sendMessage(room, true).catch(() => null);
      for (const { name, content } of MALFORMED) {
        if (!target && name === "variant-1") continue;
        try {
          const eventId = await bot.send(room.roomId, "m.room.message", content(target ?? ""), txn());
          remember(room, eventId);
          log(room.name, "malformed", `${name} ${eventId}`, { eventId, variant: name });
        } catch (err) {
          logError(room.name, "malformed", err);
        }
      }
    },
    Number(args["malformed-after"]) * 1000,
  );
}

const summary = setInterval(() => {
  const elapsed = Math.round((Date.now() - started) / 1000);
  const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}`);
  console.log(`--- ${elapsed}s: ${parts.join(", ")}`);
}, 30_000);

async function shutdown() {
  for (const t of timers) clearInterval(t);
  clearInterval(summary);
  await Promise.all(rooms.map((room) => bot.setTyping(room.roomId, false).catch(() => undefined)));
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(
    `chaosbot stopped after ${elapsed}s: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
if (durationS > 0) {
  await sleep(durationS * 1000);
  await shutdown();
}

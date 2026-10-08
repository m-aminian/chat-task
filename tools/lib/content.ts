import type { Rng } from "./random.js";

const SHORT_REPLIES = [
  "lgtm",
  "on it",
  "ack",
  "thanks!",
  "makes sense",
  "+1",
  "sounds good",
  "will check after lunch",
  "can you share the logs?",
  "merged",
  "deploying now",
  "rolled back",
  "hmm, not sure about that",
  "good catch",
  "nice",
  "brb",
  "back",
  "who owns this?",
  "ping me when it's up",
  "same here",
  "works on my machine",
  "ok",
  "agreed",
  "let's discuss in standup",
  "done",
  "looking",
] as const;

const SUBJECTS = [
  "the sync loop",
  "the staging cluster",
  "our retry logic",
  "the new composer",
  "the release branch",
  "the media service",
  "this migration",
  "the login flow",
  "the federation queue",
  "the search index",
  "the room list",
  "the push gateway",
  "the read receipts",
  "the CI pipeline",
  "the e2e suite",
  "the design review",
  "the onboarding docs",
  "the notification badge",
  "the thread view",
  "the cache layer",
] as const;

const VERBS = [
  "looks flaky again",
  "needs another pass",
  "is much faster now",
  "broke after the upgrade",
  "should be behind a flag",
  "times out on large rooms",
  "was reverted yesterday",
  "is ready for review",
  "needs a design review",
  "needs better error messages",
  "passes locally",
  "is blocked on infra",
  "could use a benchmark",
  "looks great on Safari",
  "is waiting for QA",
  "got a lot simpler",
] as const;

const TAILS = [
  "",
  "",
  "",
  " I think",
  " as far as I can tell",
  " since Tuesday",
  " on mobile only",
  " for some users",
  " when the network drops",
  " under load",
  " after the last deploy",
  " in the big rooms",
] as const;

const OPENERS = [
  "Quick update:",
  "FYI",
  "Heads up,",
  "Honestly",
  "So",
  "Turns out",
  "Small thing:",
  "Reminder:",
  "Re the incident,",
  "From what I saw,",
  "",
  "",
  "",
  "",
] as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function sentence(rng: Rng): string {
  const opener = rng.pick(OPENERS);
  const core = `${rng.pick(SUBJECTS)} ${rng.pick(VERBS)}${rng.pick(TAILS)}`;
  const end = rng.weighted([
    [".", 6],
    ["!", 1],
    ["?", 1],
    ["", 2],
  ] as const);
  return opener ? `${opener} ${core}${end}` : `${capitalize(core)}${end}`;
}

export function shortText(rng: Rng): string {
  return rng.chance(0.35) ? rng.pick(SHORT_REPLIES) : sentence(rng);
}

function decorate(rng: Rng, text: string): string {
  const roll = rng.next();
  if (roll < 0.1) return text.replace(/the (\w+)/, "the **$1**");
  if (roll < 0.2) return text.replace(/the (\w+)/, "the `$1`");
  if (roll < 0.25) return `${text} See [the runbook](https://example.org/runbook/${rng.int(1, 999)}).`;
  if (roll < 0.3) return text.replace(/the (\w+)/, "the _$1_");
  return text;
}

export function longText(rng: Rng): string {
  const paragraphs: string[] = [];
  const count = rng.int(2, 5);
  for (let p = 0; p < count; p++) {
    const kind = rng.weighted([
      ["prose", 6],
      ["list", 2],
      ["quote", 1],
    ] as const);
    const lines = Array.from({ length: rng.int(3, 8) }, () => decorate(rng, sentence(rng)));
    if (kind === "list") paragraphs.push(lines.map((l) => `- ${l}`).join("\n"));
    else if (kind === "quote") paragraphs.push(lines.map((l) => `> ${l}`).join("\n"));
    else paragraphs.push(lines.join(" "));
  }
  return paragraphs.join("\n\n");
}

const COLUMNS = [
  "Service",
  "Owner",
  "p50 (ms)",
  "p99 (ms)",
  "Errors",
  "Status",
  "Region",
  "Version",
  "Notes",
];
const SERVICES = ["sync", "media", "push", "search", "auth", "federation", "presence", "receipts", "typing"];
const OWNERS = ["alice", "bob", "carol", "dave", "erin"];
const STATUSES = ["✅ ok", "⚠️ degraded", "❌ down", "🔧 maintenance"];
const REGIONS = ["eu-west", "eu-central", "us-east", "ap-south"];

export function markdownTable(rng: Rng): string {
  const cols = rng.shuffle([...COLUMNS]).slice(0, rng.int(3, 6));
  const rows = rng.int(3, 12);
  const cell = (col: string): string => {
    switch (col) {
      case "Service":
        return rng.pick(SERVICES);
      case "Owner":
        return `@${rng.pick(OWNERS)}`;
      case "p50 (ms)":
        return String(rng.int(2, 120));
      case "p99 (ms)":
        return String(rng.int(120, 4000));
      case "Errors":
        return `${(rng.next() * 3).toFixed(2)}%`;
      case "Status":
        return rng.pick(STATUSES);
      case "Region":
        return rng.pick(REGIONS);
      case "Version":
        return `v${rng.int(1, 4)}.${rng.int(0, 30)}.${rng.int(0, 9)}`;
      default:
        return rng.pick(SHORT_REPLIES);
    }
  };
  const header = `| ${cols.join(" | ")} |`;
  const divider = `| ${cols.map((c) => (/\d|ms|%/.test(c) ? "---:" : "---")).join(" | ")} |`;
  const body = Array.from({ length: rows }, () => `| ${cols.map(cell).join(" | ")} |`);
  const intro = rng.pick([
    "Numbers from this morning:",
    "Current status:",
    "Summary table:",
    "Here's the breakdown",
  ]);
  return [intro, "", header, divider, ...body].join("\n");
}

type LineGen = (rng: Rng, i: number) => string;

const LANGS: Record<string, { open: string[]; line: LineGen; close: string[] }> = {
  ts: {
    open: [
      'import { fetchJson } from "./http";',
      "",
      "export async function handle(input: Input): Promise<Output> {",
    ],
    line: (rng, i) =>
      rng.pick([
        `  const v${i} = await fetchJson<Item>(\`/api/items/\${input.id}/${i}\`);`,
        `  if (!v${i - 1}?.ok) throw new Error("request ${i} failed");`,
        `  results.push({ index: ${i}, value: v${i - 1} ?? null });`,
        `  // step ${i}: normalise and validate`,
        `  log.debug("processed", { step: ${i}, size: results.length });`,
        `  const key${i} = \`\${input.roomId}:${i}\`;`,
      ]),
    close: ["  return { results };", "}"],
  },
  python: {
    open: ["import asyncio", "from dataclasses import dataclass", "", "async def run(client, room_id):"],
    line: (rng, i) =>
      rng.pick([
        `    resp_${i} = await client.get(f"/rooms/{room_id}/messages?limit=${i}")`,
        `    if resp_${i - 1}.status != 200:`,
        `        raise RuntimeError("step ${i} failed")`,
        `    events.extend(resp_${i - 1}.json().get("chunk", []))`,
        `    # step ${i}: back off before the next page`,
        `    await asyncio.sleep(${(i % 5) / 10})`,
      ]),
    close: ["    return events"],
  },
  rust: {
    open: [
      "use std::collections::HashMap;",
      "",
      "pub fn merge(events: &[Event]) -> Vec<Event> {",
      "    let mut seen = HashMap::new();",
    ],
    line: (rng, i) =>
      rng.pick([
        `    let e${i} = events.get(${i}).cloned().unwrap_or_default();`,
        `    seen.insert(e${i - 1}.id.clone(), ${i});`,
        `    if seen.contains_key(&e${i - 1}.id) { continue; }`,
        `    // step ${i}: keep server order`,
        `    out.push(e${i - 1});`,
      ]),
    close: ["    out", "}"],
  },
  sql: {
    open: ["SELECT e.event_id, e.room_id, e.origin_server_ts", "FROM events e", "WHERE e.room_id = $1"],
    line: (rng, i) =>
      rng.pick([
        `  AND e.stream_ordering > ${i * 1000}`,
        `  -- partition ${i}`,
        `  OR e.event_id IN (SELECT relates_to_id FROM event_relations WHERE rel_type = 'm.replace' LIMIT ${i})`,
        `  AND e.type <> 'm.room.member'`,
      ]),
    close: ["ORDER BY e.stream_ordering DESC", "LIMIT 50;"],
  },
  json: {
    open: ["{", '  "filter": {'],
    line: (_rng, i) => `    "key_${i}": { "limit": ${i}, "lazy_load_members": ${i % 2 === 0} },`,
    close: ['    "end": true', "  }", "}"],
  },
  bash: {
    open: ["#!/usr/bin/env bash", "set -euo pipefail", ""],
    line: (rng, i) =>
      rng.pick([
        `curl -fsS "$HS/_matrix/client/v3/sync?timeout=${i * 100}" -H "Authorization: Bearer $TOKEN" > /tmp/sync_${i}.json`,
        `echo "step ${i}"`,
        `jq '.rooms.join | keys' /tmp/sync_${i - 1}.json`,
        `# step ${i}`,
      ]),
    close: ["echo done"],
  },
};

export function codeBlock(rng: Rng): string {
  const lang = rng.pick(Object.keys(LANGS));
  const spec = LANGS[lang]!;
  const count = rng.int(50, 200);
  const lines = [...spec.open];
  for (let i = 1; lines.length < count - spec.close.length; i++) lines.push(spec.line(rng, i));
  lines.push(...spec.close);
  const intro = rng.pick([
    "Here's the snippet:",
    "This is what I have so far",
    "Repro:",
    "Full version below",
    "Can someone sanity check this?",
  ]);
  return `${intro}\n\n\`\`\`${lang}\n${lines.join("\n")}\n\`\`\``;
}

export const COMMON_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🚀", "✅", "🙏", "🔥", "😅"] as const;

export const MANY_REACTIONS = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "🎉",
  "👀",
  "🚀",
  "✅",
  "🙏",
  "🔥",
  "😅",
  "🤔",
  "😍",
  "😎",
  "🥳",
  "😢",
  "😡",
  "🤯",
  "🙌",
  "👏",
  "💯",
  "⭐",
  "🌟",
  "⚡",
  "💡",
  "🐛",
  "🛠️",
  "📦",
  "🧪",
  "📈",
  "📉",
  "🕐",
  "🍕",
  "☕",
  "🍺",
  "🍩",
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🐧",
  "🦄",
  "🌈",
  "🌊",
  "🌲",
  "🍀",
  "🌻",
  "🍎",
  "🍋",
  "🍉",
  "🥑",
  "🌶️",
  "🧀",
  "🥨",
  "🎸",
  "🎧",
  "🎮",
  "🎯",
  "🏆",
  "⚽",
  "🏀",
  "🚲",
  "✈️",
  "🚢",
  "🛰️",
  "🗺️",
  "🏔️",
  "🏝️",
  "🌙",
  "☀️",
  "❄️",
  "☔",
  "🔒",
  "🔑",
  "📌",
  "📎",
  "✏️",
  "📝",
  "📚",
  "🧠",
  "💪",
  "🤝",
  "✌️",
  "🤞",
  "👋",
  "🫡",
  "🤷",
  "🙈",
  "💀",
  "👻",
  "🤖",
  "👾",
  "🎃",
  "🎄",
  "🎁",
  "🧩",
  "🪄",
  "🧲",
  "🔭",
  "🧭",
] as const;

import {
  COMMON_REACTIONS,
  MANY_REACTIONS,
  codeBlock,
  longText,
  markdownTable,
  sentence,
  shortText,
} from "../lib/content.js";
import type { Username } from "../lib/config.js";
import { Rng } from "../lib/random.js";

export interface RoomProfile {
  name: string;
  topic: string;
  seed: number;
  messages: number;
  images: number;
  codeBlocks: number;
  tables: number;
  longTexts: number;
  replies: number;
  notices: number;
  emotes: number;
  edits: number;
  redactions: number;

  redactionsOfEdited: number;

  heavyReactionTargets: number;
  sparseReactions: number;

  unreadForAlice: number;
}

export type Kind = "short" | "long" | "table" | "code" | "image" | "reply" | "notice" | "emote";

export type Op =
  | { kind: "message"; seq: number; idx: number; sender: Username; msg: Kind; body: string; replyTo?: number }
  | { kind: "edit"; seq: number; target: number; sender: Username; body: string }
  | { kind: "reaction"; seq: number; target: number; sender: Username; key: string }
  | { kind: "redaction"; seq: number; target: number; sender: Username };

export interface Plan {
  ops: Op[];
  originals: number;
  counts: Record<Op["kind"] | Kind, number>;
}

const SENDER_WEIGHTS = [
  ["alice", 25],
  ["bob", 25],
  ["carol", 15],
  ["dave", 13],
  ["erin", 12],
  ["chaosbot", 10],
] as const satisfies readonly (readonly [Username, number])[];

const REACTORS: Username[] = ["alice", "bob", "carol", "dave", "erin"];
const EDITABLE = new Set<Kind>(["short", "long", "reply", "table"]);

interface Pending {
  anchor: number;
  order: number;
  build: () => Op | null;
}

export function buildPlan(p: RoomProfile): Plan {
  const rng = new Rng(p.seed);
  const n = p.messages;

  const special: Kind[] = [
    ...Array<Kind>(p.images).fill("image"),
    ...Array<Kind>(p.codeBlocks).fill("code"),
    ...Array<Kind>(p.tables).fill("table"),
    ...Array<Kind>(p.longTexts).fill("long"),
    ...Array<Kind>(p.replies).fill("reply"),
    ...Array<Kind>(p.notices).fill("notice"),
    ...Array<Kind>(p.emotes).fill("emote"),
  ];
  if (special.length > n) throw new Error(`${p.name}: profile has more special messages than messages`);
  const kinds = rng.shuffle([...special, ...Array<Kind>(n - special.length).fill("short")]);

  const firstPlain = kinds.indexOf("short");
  if (firstPlain > 0) [kinds[0], kinds[firstPlain]] = [kinds[firstPlain]!, kinds[0]!];

  const senders = kinds.map(() => rng.weighted(SENDER_WEIGHTS));
  const redacted = new Set<number>();
  const protectedIdx = new Set<number>();
  const edited: number[] = [];
  const editedSet = new Set<number>();
  const reactionKeys = new Set<string>();

  const pickTarget = (anchor: number, ok: (idx: number) => boolean): number | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const idx = rng.chance(0.6) ? anchor - rng.int(0, Math.min(anchor, 200)) : rng.int(0, anchor);
      if (ok(idx)) return idx;
    }
    return null;
  };

  const pending: Pending[] = [];

  for (let h = 0; h < p.heavyReactionTargets; h++) {
    let target: number;
    do target = rng.int(0, Math.floor(n * 0.9));
    while (protectedIdx.has(target));
    protectedIdx.add(target);
    const keys = rng.shuffle([...MANY_REACTIONS]).slice(0, rng.int(50, 80));
    keys.forEach((key, k) => {
      const sender = REACTORS[k % REACTORS.length]!;
      reactionKeys.add(`${sender}|${target}|${key}`);
      pending.push({
        anchor: Math.min(n - 1, target + rng.int(0, 1500)),
        order: 1,
        build: () => ({ kind: "reaction", seq: 0, target, sender, key }),
      });
    });
  }

  for (let e = 0; e < p.edits; e++) {
    const anchor = rng.int(1, n - 1);
    pending.push({
      anchor,
      order: 0,
      build: () => {
        const reEditable = rng.chance(0.25) ? edited.filter((i) => i <= anchor && !redacted.has(i)) : [];
        const target =
          reEditable.length > 0
            ? rng.pick(reEditable)
            : pickTarget(anchor, (i) => EDITABLE.has(kinds[i]!) && !redacted.has(i));
        if (target === null) return null;
        if (!editedSet.has(target)) {
          editedSet.add(target);
          edited.push(target);
        }
        const body =
          kinds[target] === "long"
            ? longText(rng)
            : `${shortText(rng)} (${rng.pick(["fixed typo", "updated", "clarified", "edit"])})`;
        return { kind: "edit", seq: 0, target, sender: senders[target]!, body };
      },
    });
  }

  let redactionsOfEditedLeft = p.redactionsOfEdited;
  for (let r = 0; r < p.redactions; r++) {
    const anchor = rng.int(Math.floor(n * 0.05), n - 1);
    pending.push({
      anchor,
      order: 2,
      build: () => {
        const free = (i: number) => !redacted.has(i) && !protectedIdx.has(i);
        let target: number | null = null;
        if (redactionsOfEditedLeft > 0) {
          const candidates = edited.filter((i) => i <= anchor && free(i));
          if (candidates.length > 0) {
            target = rng.pick(candidates);
            redactionsOfEditedLeft--;
          }
        }
        target ??= pickTarget(anchor, free);
        if (target === null) return null;
        redacted.add(target);
        return { kind: "redaction", seq: 0, target, sender: senders[target]! };
      },
    });
  }

  for (let s = 0; s < p.sparseReactions; s++) {
    const anchor = rng.int(0, n - 1);
    pending.push({
      anchor,
      order: 1,
      build: () => {
        const sender = rng.pick(REACTORS);
        const key = rng.pick(COMMON_REACTIONS);
        const target = pickTarget(
          anchor,
          (i) => !redacted.has(i) && !reactionKeys.has(`${sender}|${i}|${key}`),
        );
        if (target === null) return null;
        reactionKeys.add(`${sender}|${target}|${key}`);
        return { kind: "reaction", seq: 0, target, sender, key };
      },
    });
  }

  pending.sort((a, b) => a.anchor - b.anchor || a.order - b.order);

  const ops: Op[] = [];
  let cursor = 0;
  for (let idx = 0; idx < n; idx++) {
    const msg = kinds[idx]!;
    const replyTo =
      msg === "reply"
        ? (pickTarget(Math.max(0, idx - 1), (i) => i < idx && kinds[i] !== "image") ?? 0)
        : undefined;
    ops.push({
      kind: "message",
      seq: 0,
      idx,
      sender: senders[idx]!,
      msg,
      body: messageBody(rng, msg, idx),
      replyTo,
    });
    while (cursor < pending.length && pending[cursor]!.anchor === idx) {
      const item = pending[cursor++]!;
      const op = item.build();
      if (op) ops.push(op);
    }
  }
  ops.forEach((op, seq) => (op.seq = seq));

  const counts = {} as Plan["counts"];
  for (const op of ops) {
    counts[op.kind] = (counts[op.kind] ?? 0) + 1;
    if (op.kind === "message") counts[op.msg] = (counts[op.msg] ?? 0) + 1;
  }
  return { ops, originals: n, counts };
}

function messageBody(rng: Rng, kind: Kind, idx: number): string {
  switch (kind) {
    case "short":
    case "reply":
      return shortText(rng);
    case "long":
      return longText(rng);
    case "table":
      return markdownTable(rng);
    case "code":
      return codeBlock(rng);
    case "image":
      return `screenshot-${String(idx).padStart(5, "0")}.png`;
    case "notice":
      return `Build #${rng.int(1000, 9999)} ${rng.pick(["passed", "failed", "was cancelled"])} on ${rng.pick(["main", "release", "staging"])}`;
    case "emote":
      return rng.pick([
        "waves",
        "is grabbing coffee",
        "is out until Monday",
        "facepalms",
        "is on call this week",
      ]);
    default: {
      const unreachable: never = kind;
      return sentence(rng) + unreachable;
    }
  }
}

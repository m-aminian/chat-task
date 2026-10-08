import type { Username } from "../lib/config.js";
import type { MatrixClient } from "../lib/matrix.js";
import { generateImage } from "../lib/png.js";
import { mapLimit } from "../lib/pool.js";
import { Rng } from "../lib/random.js";
import type { Op, Plan, RoomProfile } from "./plan.js";

const WINDOW = 250;
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 24);

type MessageOp = Extract<Op, { kind: "message" }>;

export interface RunResult {
  eventIds: string[];
  images: number;
  imageBytes: number;
}

export async function runPlan(
  profile: RoomProfile,
  plan: Plan,
  roomId: string,
  clients: Record<Username, MatrixClient>,
): Promise<RunResult> {
  const eventIds: string[] = new Array(plan.originals);
  const txn = (op: Op) => `seed${profile.seed}-${profile.name}-${op.seq}`;
  const target = (idx: number) => {
    const id = eventIds[idx];
    if (!id) throw new Error(`missing event for message ${idx}`);
    return id;
  };

  let done = 0;
  let images = 0;
  let imageBytes = 0;
  const started = Date.now();
  const progress = setInterval(() => report(false), 2000);
  function report(final: boolean) {
    const secs = (Date.now() - started) / 1000;
    const line = `  #${profile.name.padEnd(6)} ${String(done).padStart(6)}/${plan.ops.length} events  images ${images}/${profile.images}  ${(done / Math.max(secs, 0.001)).toFixed(0)}/s  ${secs.toFixed(0)}s`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}${final ? "\n" : ""}`);
    else console.log(line);
  }

  const sendMessage = async (op: MessageOp) => {
    const content: Record<string, unknown> = {
      msgtype: op.msg === "notice" ? "m.notice" : op.msg === "emote" ? "m.emote" : "m.text",
      body: op.body,
    };
    if (op.msg === "image") {
      const img = generateImage(new Rng(profile.seed * 1_000_003 + op.idx));
      const url = await clients[op.sender].upload(img.data, op.body, "image/png");

      Object.assign(content, {
        msgtype: "m.image",
        url,
        info: { mimetype: "image/png", size: img.data.length },
      });
      images++;
      imageBytes += img.data.length;
    }
    if (op.replyTo !== undefined) {
      content["m.relates_to"] = { "m.in_reply_to": { event_id: target(op.replyTo) } };
    }
    eventIds[op.idx] = await clients[op.sender].send(roomId, "m.room.message", content, txn(op));
    done++;
  };

  const sendRelation = async (op: Exclude<Op, MessageOp>) => {
    const client = clients[op.sender];
    switch (op.kind) {
      case "edit":
        await client.send(
          roomId,
          "m.room.message",
          {
            msgtype: "m.text",
            body: `* ${op.body}`,
            "m.new_content": { msgtype: "m.text", body: op.body },
            "m.relates_to": { rel_type: "m.replace", event_id: target(op.target) },
          },
          txn(op),
        );
        break;
      case "reaction":
        await client.send(
          roomId,
          "m.reaction",
          { "m.relates_to": { rel_type: "m.annotation", event_id: target(op.target), key: op.key } },
          txn(op),
        );
        break;
      case "redaction":
        await client.redact(roomId, target(op.target), txn(op));
        break;
    }
    done++;
  };

  try {
    for (let start = 0; start < plan.ops.length; start += WINDOW) {
      const window = plan.ops.slice(start, start + WINDOW);

      let messages = window.filter((op): op is MessageOp => op.kind === "message");
      while (messages.length > 0) {
        const ready = messages.filter((m) => m.replyTo === undefined || eventIds[m.replyTo]);
        if (ready.length === 0) throw new Error("reply ordering deadlock");
        await mapLimit(ready, CONCURRENCY, sendMessage);
        messages = messages.filter((m) => !ready.includes(m));
      }

      const relations = window.filter((op): op is Exclude<Op, MessageOp> => op.kind !== "message");

      const edits = relations.filter((op) => op.kind === "edit");
      const reactions = relations.filter((op) => op.kind === "reaction");
      await Promise.all([
        (async () => {
          for (const op of edits) await sendRelation(op);
        })(),
        mapLimit(reactions, CONCURRENCY, sendRelation),
      ]);
      await mapLimit(
        relations.filter((op) => op.kind === "redaction"),
        CONCURRENCY,
        sendRelation,
      );
    }
  } finally {
    clearInterval(progress);
    report(true);
  }
  return { eventIds, images, imageBytes };
}

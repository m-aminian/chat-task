import { registerUser } from "./lib/admin.js";
import { SEED_MARKER_TYPE, SEED_VERSION, USERS, roomAlias, type Username } from "./lib/config.js";
import { MatrixClient } from "./lib/matrix.js";
import { buildPlan } from "./seed/plan.js";
import { PROFILES } from "./seed/profiles.js";
import { receiptTarget } from "./seed/receipt.js";
import { runPlan } from "./seed/run.js";

interface SeedMarker {
  version: number;
  complete: boolean;
}

const only = process.argv.slice(2);
const profiles = only.length > 0 ? PROFILES.filter((p) => only.includes(p.name)) : PROFILES;
const t0 = Date.now();

console.log("Users");
for (const [name, { admin }] of Object.entries(USERS)) {
  const created = await registerUser(name, admin);
  console.log(`  ${created ? "registered" : "exists    "} @${name}:localhost${admin ? " (admin)" : ""}`);
}

const senders: Username[] = ["alice", "bob", "carol", "dave", "erin", "chaosbot"];
const clients = Object.fromEntries(
  await Promise.all(senders.map(async (u) => [u, await MatrixClient.login(u, "SEED")] as const)),
) as Record<Username, MatrixClient>;
const alice = clients.alice;

for (const profile of profiles) {
  const alias = roomAlias(profile.name);
  let roomId = await alice.resolveAlias(alias);
  if (roomId) {
    const marker = await alice.getState<SeedMarker>(roomId, SEED_MARKER_TYPE);
    if (marker?.complete && marker.version === SEED_VERSION) {
      console.log(`${alias} already seeded (${roomId}), skipping`);
      continue;
    }
    if (marker && marker.version !== SEED_VERSION) {
      console.error(
        `${alias} was seeded by a different seed version (${marker.version}). Run \`make reset\`.`,
      );
      process.exit(1);
    }
    console.log(`${alias} exists but is incomplete, resuming (${roomId})`);
  } else {
    roomId = await alice.createRoom({ alias: profile.name, name: profile.name, topic: profile.topic });
    console.log(`${alias} created (${roomId})`);
  }

  await Promise.all(senders.filter((u) => u !== "alice").map((u) => clients[u].join(roomId)));

  const plan = buildPlan(profile);
  const c = plan.counts;
  console.log(
    `  plan: ${plan.originals} messages (${c.image ?? 0} images, ${c.code ?? 0} code, ${c.table ?? 0} tables, ${c.reply ?? 0} replies), ` +
      `${c.edit ?? 0} edits, ${c.reaction ?? 0} reactions, ${c.redaction ?? 0} redactions`,
  );
  const result = await runPlan(profile, plan, roomId, clients);

  const readUpTo = await receiptTarget(alice, roomId, profile.unreadForAlice);
  if (readUpTo) await alice.sendReceipt(roomId, readUpTo);

  await alice.setState(roomId, SEED_MARKER_TYPE, {
    version: SEED_VERSION,
    complete: true,
    counts: c,
    image_bytes: result.imageBytes,
  });
  console.log(`  done, ${(result.imageBytes / 1024 / 1024).toFixed(1)} MB of images`);
}

console.log(`Seed finished in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

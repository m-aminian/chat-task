import { HOMESERVER } from "./lib/config.js";

const TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS ?? 180_000);
const started = Date.now();

process.stdout.write(`Waiting for Synapse at ${HOMESERVER} `);
for (;;) {
  try {
    const res = await fetch(`${HOMESERVER}/health`);
    if (res.ok) break;
  } catch {}
  if (Date.now() - started > TIMEOUT_MS) {
    console.error(`\nSynapse did not become healthy within ${TIMEOUT_MS / 1000}s.`);
    console.error("Inspect the server with: make logs");
    process.exit(1);
  }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(` ready (${((Date.now() - started) / 1000).toFixed(1)}s)`);

# Notes

Five fixes, one per commit, each mapped to one of the four reported complaints.
Ordered correctness-first, cheapest-and-most-visible first, riskiest last.

| # | Commit | Fix | Complaint |
| --- | --- | --- | --- |
| 1 | `c52a3f2` | Blank screen on malformed image messages | blank screen |
| 2 | `f519064` | Duplicate messages and permanently stuck local echoes | state mismatch |
| 3 | `5c7cd0f` | The relative-time clock's interval leak | laptop hot |
| 4 | `ecd2016` | Selective store subscriptions; a mutating selector | slow, hot |
| 5 | `8d98c37` | Virtualize the timeline; stop rebuilding every row | slow, hot |

## What I changed and why

**1. Blank screen (`c52a3f2`).** A message whose image address was not a string
crashed the whole app. `mediaUrl()` correctly rejected the value, but
`InvalidMediaUrlError`'s own constructor interpolated `url.slice(0, 80)` — assuming
text — so it threw a `TypeError` *while constructing the error object*, during render,
with no boundary anywhere in the tree. Fixed in four layers: safe error construction
for any input type; a shared `isValidMxcUri()` check; an `ErrorBoundary` around each
message tile (so one bad message loses only itself) and around the app as a backstop;
and `parseEvent` now validating message shape where server data enters the app —
strict on essential fields (`body`, `url`), lenient on cosmetic ones (image `info`).

**2. Duplicate messages (`f519064`).** Two separate bugs. First, `api.send()` minted
its *own* transaction id instead of using the queue's, so every retry looked like a
brand-new message to the server — Matrix deduplicates on transaction id, so retries
created real server-side duplicates. The id is now threaded from the queue through to
the request. Second, echo reconciliation matched only on `local.eventId`, which is set
*after* the send resolves; if sync delivered the event first, the local echo was never
cleared and the message appeared twice forever. Matching now accepts either the
transaction id or the event id, so whichever arrives first wins.

**3. Laptop heat (`5c7cd0f`).** Every timestamp on screen created its *own*
`setInterval`, and each tick notified *all* subscribers — O(N²) wakeups per 30s. The
cleanup only cleared the timer when the listener set emptied, so any subscriber
unmounting while others remained leaked its interval permanently. One shared timer at
the clock's level now, created on the first subscriber and cleared when the last
leaves. Measured: **3,594 live intervals → 2**, flat regardless of scrolling or room
switching.

**4. Re-render storms (`ecd2016`).** The entire `AppState` was passed through one
React Context, so every store write re-rendered every consumer — `memo()` cannot stop
Context propagation. `useSelector` now subscribes to the store directly via
`useSyncExternalStore` with the selector inside `getSnapshot`, so React decides
per-component whether that component's slice actually changed. Also fixed
`selectRoomOrder`, which called `.sort()` on `state.roomIds` — mutating store state
during render, which made its own equality check permanently dead and would tear under
the concurrent React this app already uses. Measured: **96 → 4** re-renders of an idle
room over 35s. The last 4 are legitimate (its sort position genuinely changes).

**5. Timeline rendering (`8d98c37`).** `#big` rendered all 20,000 tiles, each running
markdown + sanitizer + highlighter. Now windowed to the rows near the viewport. Two
prerequisites had to land first: row keys were the row's own *index*, so prepending
history silently changed what every key meant (windowing on unstable keys makes scroll
anchoring worse, not better); and the row cache was keyed on the whole timeline object,
which is recreated on every change, so it never hit once. `window.__timeline` stays
backed by store state, never the DOM, so it still reports the full dataset while ~40
tiles are mounted.

Scroll anchoring during pagination is delegated to the virtualizer's own
`anchorTo`/`followOnAppend` rather than hand-rolled. That was not the first attempt: a
hand-rolled anchor left a 132px jump, and re-asserting it on every commit made it
**worse (209px)**, because the virtualizer maintains its own model of the scroll
position and compensates resizes through it — writing `scrollTop` directly behind its
back meant two anchoring systems stacking corrections. Reading the dependency's source
replaced ~130 lines with three options, and deleted `hooks/useScrollAnchor.ts`.

## How I verified it

Every fix was reproduced live before being written, and re-measured after. Not just
unit tests — the interesting bugs here are all timing, memory or rendering bugs that
tests of this codebase's shape would not catch.

### The checker, end to end

Two runs, both clean — one for correctness under adversarial conditions, one for scale.

```
#small      275 rows (full history)   CLEAN      (soak 4, chaos, network faults on)
#big       1579 rows (newest 1579)    CLEAN      (history load + truth comparison)
```

The `#big` run is what validates the virtualization: 1,579 rows compared against server
ground truth with only ~40 tiles ever mounted, and zero missing, duplicated or
unexpected events. That is the `window.__timeline` contract holding under windowing —
the single biggest risk in fix 5.

The `#small` run is what validates correctness under stress. The conditions it survived
are the point:

| | |
| --- | --- |
| messages sent through the composer | 46 |
| send responses delayed 2s | 23 |
| send responses **dropped** (forcing retries) | 22 |
| `/sync` requests aborted | 48 |
| **shown exactly once / stored exactly once** | **46 / 46** |
| duplicates, missing, local echoes, wrong edits | **0** |

22 dropped responses mean 22 forced retries, and not one produced a second stored
event — which is exactly fix 2's mechanism (retries reuse the transaction id, so
Synapse deduplicates) demonstrated end to end rather than argued. 48 aborted syncs
recovered without wedging, and the chaos bot ran throughout without a blank screen.

### Per-fix evidence

| Fix | Evidence |
| --- | --- |
| 1 | Reproduced the crash under soak + chaos (3 uncaught errors, root unmounted, never recovered); zero uncaught errors after, and the run above was clean |
| 2 | 46/46 sent exactly once under 22 dropped responses (above); plus a probe showing concurrent same-txn sends return **one** event id |
| 3 | `tools/probe-timers.ts` (committed): 3,594 live intervals → **2** |
| 4 | Render counter on an idle room: **96 → 4** over 35s |
| 5 | **0.0px** anchor drift across three pagination rounds, reproduced twice; 40 tiles for 493 events; heap growth **+0.2MB vs +10MB** |

TypeScript clean, 46/46 tests passing, and `vite build` succeeds (413 kB, 129 kB
gzipped).

### Where the evidence is weaker, stated plainly

**Scroll FPS is improved but I cannot put a number on it.** Two runs of the supplied
harness disagree beyond the size of the effect:

| | Baseline | Run 1 | Run 2 |
| --- | --- | --- | --- |
| rows loaded | 1,654 | 3,008 | 2,820 |
| avg FPS | 13.8 | 23.7 | 15.7 |
| p95 frame ms | 133.4 | 116.6 | 183.4 |

Run 2's p95 is worse than baseline. The cause is that `loadHistory` gives up after
three no-progress rounds, so each run measures a different workload — one run's heap
phase loaded **15 rows**. I am deliberately not quoting a headline FPS figure from
this. What is solid is the anchor result (direct, reproduced) and the *flatness* of
heap growth (+0.2MB in both runs, against a baseline that climbed monotonically and
never plateaued). My best guess for the remaining frame cost is per-tile markdown work
on mount, which scrolling triggers continuously — a hypothesis, not a measurement.

**The clean runs above cover one room each, not all three at once.** The combined
`--rooms small,medium,big --soak 10` run never completed on this machine, for reasons
that turned out to be environmental and harness-side rather than client bugs — see the
harness notes below. `#medium` specifically is unverified: the one attempt that reached
it died on a Node-side `fetch failed` while reading its ground truth.

**A `#big` run initially reported 10 missing events, and chasing that down was
worthwhile.** All ten turned out to be valid `m.text` messages from the chaos bot,
created inside a single ~16-second window. The cause was an orphaned chaos bot still
injecting into the room *during* the measurement: the checker reads ground truth, then
allows only 10s (`waitForCatchUp`) for the client to catch up, against a sync long-poll
of up to 30s. Re-running against a quiet room gave **CLEAN** on 1,579 rows. Worth
stating because the first instinct was that my own `parseEvent` validation (fix 1) was
rejecting good events — ruling that out, rather than assuming either way, is what made
the result trustworthy.

**One unexplained console 404** appears in `make measure` runs. It does not reproduce in
targeted probes of either room. Best hypothesis, now rather better supported: chaos runs
permanently inject events referencing media that does not exist, and the clean baseline
predates any chaos run — polluted test data rather than a code regression. Still
unconfirmed, and I would rather flag it than quietly drop it.

**One unexplained console 404** appears in `make measure` runs. It does not reproduce
in targeted probes of either room. Best hypothesis: earlier chaos runs permanently
injected image events referencing media that does not exist, and the clean baseline
predates any chaos run — making it polluted test data rather than a code regression.
Unconfirmed, and I would rather flag it than quietly drop it.

## What I would do next

- **Trim timeline history (finding M, partially done).** Virtualization bounded the
  *DOM* to ~40 tiles, which is what made heap growth flat. The *store* still
  accumulates every paginated event forever, so idling at the top of `#big` still
  pulls 20,000 events into memory. The flat heap reading only means those scroll
  rounds load no new events — it is not evidence that this is fixed. Would cap
  retained events per room and drop the far side, keeping `prevBatch` so the dropped
  range can be re-fetched.

- **Fix the sync engine's silent "stuck reconnecting" bug (finding H).**
  `sync/engine.ts` only advances its bookmark (`this.since = response.next_batch`)
  *after* successfully processing a batch. If processing throws, the bookmark never
  moves, so the engine re-fetches and re-processes the same batch forever — a poison
  pill that wedges sync behind a "reconnecting" banner with no crash and no error.
  Found by reading the control flow, not from a live crash; it no longer has an easy
  reproduction, because fix 1's `parseEvent` validation closed off the most direct way
  to trigger a processing-time throw. The ordering mistake is still there. Would move
  the bookmark update earlier and isolate per-room failures.

- **Stop full-rate long-polling on a hidden tab (finding N).** `useDocumentVisible`
  already exists but is only wired to read receipts, so a backgrounded tab syncs at
  full rate — directly relevant to the laptop-heat complaint, and cheap.

- **Parallelise gap fill (finding J).** On a `limited` sync the engine awaits up to
  five serial `/messages` round-trips *inside* the per-room loop, blocking every other
  room and the next sync cycle. Its `existing` snapshot is also taken before the await,
  so it is applied against stale state.

- **Move per-tile markdown off the render path.** The likely remaining cause of frame
  time; would measure first, then cache parsed output keyed by event id and revision.

- **Four harness/tooling issues worth reporting back**, all hit while verifying this:
  1. `make check` does not forward `ARGS`, so `make check ARGS="…"` silently ignores
     them — every documented invocation of the checker's flags is a no-op.
  2. `checker.ts:79` awaits `route.fetch()` with no `.catch()` (the sibling branch on
     line 84 has one), so one slow response becomes an unhandled rejection that kills
     the whole run. On this machine a trivial send to an *idle* Synapse took 5.0s and
     5.1s out of five attempts, so exceeding Playwright's 30s default under soak load
     is routine, and the run dies with no report.
  3. `stopChaos` sends SIGINT to the `npx` wrapper that `startChaos` spawned, not to
     the process group — so the real `node … chaos-bot.ts` grandchild **survives every
     run**. An orphan then keeps writing to the rooms, which silently corrupts later
     measurements (this is what produced the phantom "10 missing events" above) and
     loads the homeserver enough to trigger issue 2 on the next run.
  4. `loadHistory` gives up after three no-progress rounds and reports whatever it
     managed, so `make measure` silently compares different workloads between runs —
     one run's heap phase loaded 15 rows where another loaded 3,247. Any FPS or heap
     number from a single run is unsafe to quote.

## AI usage

Used Claude Code throughout, as a collaborator rather than a code generator. What it
was genuinely good for: pattern-recognition on first read ("unvirtualized list",
"Context re-render storm", "timer-per-subscriber"), then writing the purpose-built
instrumentation that turned each suspicion into a number — the interval probe, the
render counter, the anchor-drift harness. Those measurements are what made the work
honest, and several of them contradicted the initial diagnosis.

Three places that is visible in the result: the blank-screen root cause was one layer
deeper than first assumed (the error constructor, not the validator); the scroll-anchor
fix was reached only after two measured failures, the second of which made the problem
worse and in doing so revealed that the library already solved it; and the FPS claim
above was retracted after a second sample disagreed with the first. I reviewed every
diff before committing, and the measurements, not the model's confidence, decided what
went in.

## Time spent

Roughly two days, spread across investigation, measurement and implementation. The
split was lopsided on purpose: well over half went into reproducing bugs and building
the instrumentation to prove them, and comparatively little into the fixes themselves
— four of the five are small diffs. Fix 5 took the longest, almost entirely in the
three attempts at scroll anchoring.

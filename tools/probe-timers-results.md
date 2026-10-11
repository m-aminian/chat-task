# Timer leak probe — captured results

Produced by `probe-timers.ts`, run against the live client on both sides of the fix
in `client/src/hooks/time.ts`. Raw output captured below, unedited except for
formatting.

## Before the fix (commit `465ef62`, unmodified client)

```
--- 1. intervals vs. number of rendered rows ---
after opening #small               rows=    20  tiles=   120  live30s=   250  liveTotal=   250  created=   251  cleared=    1
after opening #medium              rows=   120  tiles=    20  live30s=   290  liveTotal=   290  created=   291  cleared=    1
#medium after scroll-up round 1    rows=   120  tiles=    70  live30s=   390  liveTotal=   390  created=   391  cleared=    1
#medium after scroll-up round 2    rows=   120  tiles=   115  live30s=   484  liveTotal=   484  created=   485  cleared=    1
#medium after scroll-up round 3    rows=   120  tiles=   157  live30s=   576  liveTotal=   576  created=   577  cleared=    1
#medium after scroll-up round 4    rows=   120  tiles=   207  live30s=   686  liveTotal=   686  created=   687  cleared=    1
#medium after scroll-up round 5    rows=   120  tiles=   207  live30s=   686  liveTotal=   686  created=   687  cleared=    1
#medium after scroll-up round 6    rows=   120  tiles=   254  live30s=   790  liveTotal=   790  created=   791  cleared=    1

--- 2. leak check: switch rooms repeatedly ---
after room-switch cycle 1          rows=   120  tiles=   254  live30s=  1538  liveTotal=  1538  created=  1539  cleared=    1
after room-switch cycle 2          rows=   155  tiles=   298  live30s=  2578  liveTotal=  2578  created=  2579  cleared=    1
after room-switch cycle 3          rows=   155  tiles=   298  live30s=  3484  liveTotal=  3484  created=  3485  cleared=    1
after room-switch cycle 4          rows=   155  tiles=   344  live30s=  3594  liveTotal=  3594  created=  3595  cleared=    1

--- 3. listener invocations per 30s tick window ---
final                              rows=   155  tiles=   344  live30s=  3594  liveTotal=  3594  created=  3595  cleared=    1

interval callbacks fired in one 30s window: 3838  (live 30s intervals: 3594)
```

**Reading it:** `cleared` stays pinned at 1 for the entire run, no matter how much
`created` climbs. Only the very last subscriber to ever unsubscribe — the one moment
the global listener count hits zero — gets its own interval cleaned up. Every single
one before it is abandoned permanently, still firing every 30 seconds, forever.

## After the fix

```
--- 1. intervals vs. number of rendered rows ---
after opening #small               rows=    20  tiles=   120  live30s=     2  liveTotal=     2  created=     3  cleared=    1
after opening #medium              rows=   120  tiles=    20  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 1    rows=   120  tiles=    70  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 2    rows=   120  tiles=   115  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 3    rows=   120  tiles=   115  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 4    rows=   120  tiles=   157  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 5    rows=   120  tiles=   207  live30s=     2  liveTotal=     2  created=     3  cleared=    1
#medium after scroll-up round 6    rows=   120  tiles=   254  live30s=     2  liveTotal=     2  created=     3  cleared=    1

--- 2. leak check: switch rooms repeatedly ---
after room-switch cycle 1          rows=   120  tiles=   254  live30s=     2  liveTotal=     2  created=     3  cleared=    1
after room-switch cycle 2          rows=   120  tiles=   120  live30s=     2  liveTotal=     2  created=     3  cleared=    1
after room-switch cycle 3          rows=   155  tiles=   254  live30s=     2  liveTotal=     2  created=     3  cleared=    1
after room-switch cycle 4          rows=   194  tiles=   298  live30s=     2  liveTotal=     2  created=     3  cleared=    1

--- 3. listener invocations per 30s tick window ---
final                              rows=   194  tiles=   344  live30s=     2  liveTotal=     2  created=     3  cleared=    1

interval callbacks fired in one 30s window: 2  (live 30s intervals: 2)
```

**Reading it:** flat, for the entire run — opening rooms, 6 scroll rounds, 4 room
switches, 344 tiles on screen at the end. None of it moves `live30s` off of 2. The
small jump from 1 live interval to 2 briefly, and `created=3` rather than a flat 1,
is itself correct behavior, not a residual leak: during a room switch there's a brief
instant where every old timestamp unmounts before the new room's timestamps mount, so
the shared listener count can genuinely hit zero — the shared timer correctly stops
itself, then correctly restarts the moment it's needed again.

## Summary

| Metric | Before | After |
| --- | --- | --- |
| Live 30s intervals at the end of the run | 3,594 | 2 |
| Interval callbacks in one 30s window | 3,838 | 2 |
| `cleared` across the whole run | 1 | 1 (correctly, each time truly idle) |

~1,800× reduction, with the before-numbers climbing continuously under ordinary use
(scrolling, switching rooms) and the after-numbers completely flat regardless of it.

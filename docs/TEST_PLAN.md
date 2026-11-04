# Test Plan

## Commands

| Command                                          | Scope                                                                                                                                              | Typical time |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `pnpm typecheck`                                 | `tsc --noEmit` in every package                                                                                                                    | ~30 s        |
| `pnpm test`                                      | Vitest: shared engine, web units, game server (in-process Colyseus)                                                                                | ~30 s        |
| `pnpm test:firebase`                             | Firestore rules + server ID-token/Firestore tests on the Auth and Firestore emulators (needs Java; uses the `demo-ludo3d` project, no credentials) | ~1 min       |
| `pnpm test:e2e`                                  | Playwright on a production build (`.next-e2e`, port 3100) + a real game server (port 2567)                                                         | ~18 min      |
| `pnpm --filter @ludo3d/web test:e2e:slow`        | Complete two-browser online match (`@slow`)                                                                                                        | ~14 min      |
| `pnpm --filter @ludo3d/web test:e2e:screenshots` | Documentation screenshots → `docs/screenshots` (`@screenshots`)                                                                                    | ~10 min      |
| `pnpm --filter @ludo3d/web test:e2e:perf`        | Performance report → `docs/perf` (`@perf`)                                                                                                         | ~2 min       |

Browser tests run headless Chromium with SwiftShader (CPU) WebGL, so most use
`quality=low` and accelerated animation (`speed=`) where frame rate does not
matter to the assertion. Test builds (`NEXT_PUBLIC_E2E=1`) expose read-only
hooks (`window.__LUDO__`, `__LUDO_ASSETS__`, `__LUDO_PERF__`) and deterministic
scenarios (`?scenario=capture|victory|choice`); production builds contain neither.
`E2E_SKIP_BUILD=1` reuses an existing build; `E2E_DEV=1` runs against `next dev`.
The `mobile` project (Pixel 7) runs tests tagged `@mobile`.

## 1. Unit tests — rules engine (`packages/shared/test`, 116 tests)

| Area                                   | Cases                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board layout                           | 52 unique track squares; closed loop of neighbouring steps; no overlap with yards/centre; rotational symmetry; start squares; stars; lanes adjacent to entry squares and reaching the centre; yard/finish slots inside regions                                             |
| Paths                                  | All four seats visit 51 distinct track squares, never the square behind their start, then lane 51–55 and finish 56; inverse mapping                                                                                                                                        |
| Entry                                  | Only 6 enters (all 5 other values pass the turn); every yard piece offered; placed on start square; custom entry values                                                                                                                                                    |
| Movement                               | Exact distance and path; overshoot excluded; no-move auto-pass                                                                                                                                                                                                             |
| Validation                             | Invalid dice (0, 7, −1, 3.5, NaN, ∞, "3"); out-of-turn; unknown seat; move before roll; roll while move pending; unknown/other's/illegal piece; malformed actions; duplicated command; input never mutated; version increments only on success                             |
| Bonus rolls                            | Six; capture; finish; six+capture capped at one; stacking when configured; unusable six; `onSixWithoutMove` off; six bonus off; none after finishing all pieces                                                                                                            |
| Three sixes                            | Third six forfeited, turn ends, earlier moves stand; only consecutive sixes count; limit 0 disables; reset on turn change                                                                                                                                                  |
| Captures                               | Lone opponent sent home; reported in legal moves; none on stars; none on start squares; never own pieces; re-entry needs a 6; capture on entry when starts unsafe; `starts-only`; stack capture when blockades off                                                         |
| Blockades                              | Cannot land; cannot pass; can stop before; auto-pass when blocked; own pieces pass; block on safe squares; block entry; mixed colours not a blockade; passing-only configuration; disabled; departed players never block                                                   |
| Finishing                              | Lane turn from 50; exact roll; finished pieces immobile; lane private; 2-player win; 4-player continues to full ranking; skipping finished players; quick-finish ranking                                                                                                   |
| Players                                | 2 (opposite), 3 (default + custom arrangement), 4; validation; first seat                                                                                                                                                                                                  |
| Leaving                                | Turn passes; last player wins; leavers ranked last in reverse order; off-turn leave; duplicate leave                                                                                                                                                                       |
| Simulation                             | 360 complete bot matches (3 profiles × 2/3/4 players × 40 seeds): invariants after every action, termination, full rankings, final board reproducible from events alone; determinism for a seed; coverage of every event type                                              |
| Property                               | 300 random command streams (fast-check) mixing legal, illegal and malformed actions: invariants always hold; rejected commands never change state; version +1 per accepted action                                                                                          |
| Bots / dice / serialisation / protocol | Bots always pick legal moves, take captures/finishes on hard; CSPRNG uniformity; scripted/seeded dice; state round-trip and tamper rejection; schema sync codec round-trip; room codes; display-name sanitising (Devanagari/Chinese safe); command and join-option schemas |

## 2. Unit tests — web (`apps/web/test`)

| File                    | Verifies                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n.test.ts`          | Every locale has exactly the English key set; ICU placeholders match; prose keys are actually translated; browser language negotiation                                                                                                       |
| `animals.test.ts`       | Each proxy has a skeleton, all 10 required states and its encounter variants, and a body length within the board-square footprint; 12 unique directed encounters, unique attack/reaction pairs, 0.8–1.4 s, real clip names; neutral fallback |
| `glb-assets.test.ts`    | Each committed GLB loads with GLTFLoader + Meshopt exactly as in the game, within its size budget, with a skeleton, every manifest clip, every track bound to a real node, and (proxies) sheen/iridescence surviving export                  |
| `camera.test.ts`        | 3/4 view inside the 45–55° band; whole board fits portrait, landscape and desktop viewports                                                                                                                                                  |
| `analytics-ads.test.ts` | No collection without consent or provider; withdrawal discards buffered events; every brief event defined; no ads during live play; interstitial caps; no ad provider shipped                                                                |
| `scenarios.test.ts`     | The deterministic E2E scenarios set up what they promise: a capture for every attacker/defender pair, a finishing roll, and a roll with two different moves                                                                                  |
| `online-errors.test.ts` | Join errors map to the right player-facing message (not found, full, unavailable, rate-limited)                                                                                                                                              |

## 3. Multiplayer tests (`apps/game-server/test/room.test.ts`, real server in-process)

Room code as room id; seat allocation and host start; joining a started match
refused; connections without a valid token refused; matchmaking without an
identity refused before any room lookup (no anonymous code probing);
matchmaking rate-limited per identity; quick match by player count
with automatic start; server-side dice with identical events on every client;
out-of-turn, duplicate (`actionId`), stale (`expectedVersion`) and malformed
commands rejected; timed-out turns auto-played; reconnection after reload keeps
the seat; a newer connection with the same identity takes the seat over; a
player leaving mid-match (last player wins, summary stored); **two clients play
a full match to the end with identical state**.

## 4. Firebase tests (`pnpm test:firebase`)

- `apps/web/test-firebase/rules.test.ts`: own-profile create/read only; clients
  can never write statistics; profile field validation; match summaries readable
  only by participants and never writable; signed-out clients denied.
- `apps/game-server/test/firebase.test.ts`: a real emulator ID token is accepted
  and tampered tokens rejected; match summaries persist and player statistics
  increment through the Admin SDK.

## 5. Browser tests (`apps/web/e2e`)

| Spec                  | Verifies                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu.spec.ts`        | Every mode renders and navigates (desktop + phone); Hindi and Chinese with persistence; settings persistence; rules page                                                                                                                                                                           |
| `local-match.spec.ts` | Bots match from the menu and a turn (desktop + phone); capture scenario (victim home, bonus roll); winning move → results → play again; **complete bot match to victory**; **a human completes a full match through the UI**; keyboard play (R rolls, 1–4 chooses an animal); leave via pause menu |
| `online.spec.ts`      | Two independent browser contexts: private room create, join by code, ready, start, server dice consistency, move, duplicate-action rejection, reload + reconnection, leave; quick match pairing by size with automatic start; `@slow` **complete online match with identical final state**         |
| `screenshots.spec.ts` | `@screenshots`: menu, board, active turn, capture sequence, victory, lobby, Hindi and Chinese menus (desktop + phone)                                                                                                                                                                              |
| `performance.spec.ts` | `@perf`: menu load timings and transfer size; per quality level scene-ready time, FPS, draw calls, triangles, textures, programs, JS heap, asset source and load time                                                                                                                              |

## 6. Acceptance criteria per milestone

- **M1**: a complete match from the main menu to victory with the local engine
  (two full-match browser tests).
- **M2**: all four animals move through their animation lifecycle in gameplay;
  all 12 encounters are defined with real clips; GLBs load through the
  production path; missing assets fall back gracefully.
- **M3**: two independent browser contexts complete an online match with
  identical state (`@slow`) and the server suite proves authority and recovery.
- **M4**: all three languages work; preferences persist; layouts work at phone
  and desktop sizes; Firebase rules and server verification pass on emulators.
- **M5**: no known critical gameplay, multiplayer or security defects;
  limitations documented in `PROGRESS.md`.

## 7. Performance checks

`docs/perf/report-<project>.json` (from `@perf`) records menu TTFB/FCP and
transfer size, and for each quality level the scene-ready time, FPS, draw calls,
triangles, geometries, textures, shader programs, device pixel ratio, JS heap
and per-animal asset load time. SwiftShader renders on the CPU, so FPS there is
a pessimistic lower bound; device FPS must be measured on real hardware (see
PROGRESS.md, next steps).

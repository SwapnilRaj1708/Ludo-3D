# Test Plan

## Commands

| Command                                                           | Scope                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm test`                                                       | All Vitest projects (shared engine, web units, game server)           |
| `pnpm typecheck`                                                  | `tsc --noEmit` in every package                                       |
| `pnpm test:e2e`                                                   | Playwright browser tests (starts `next dev` with `NEXT_PUBLIC_E2E=1`) |
| `pnpm --filter @ludo3d/web exec playwright test --project=mobile` | Phone (Pixel 7) project, tests tagged `@mobile`                       |

Browser tests run headless Chromium with SwiftShader WebGL, so they use
`quality=low` and accelerated animation (`speed=`) where frame rate is
irrelevant to the assertion.

## 1. Unit tests — rules engine (`packages/shared/test`)

| Area                                   | Cases                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board layout                           | 52 unique track squares; closed loop of neighbouring steps; no overlap with yards/centre; rotational symmetry; start squares; stars; lanes adjacent to entry squares and reaching the centre; yard/finish slots inside regions                 |
| Paths                                  | All four seats visit 51 distinct track squares, never the square behind their start, then lane 51–55 and finish 56; inverse mapping                                                                                                            |
| Entry                                  | Only 6 enters (all 5 other values pass the turn); every yard piece offered; placed on start square; custom entry values                                                                                                                        |
| Movement                               | Exact distance and path; overshoot excluded; no-move auto-pass                                                                                                                                                                                 |
| Validation                             | Invalid dice (0, 7, −1, 3.5, NaN, ∞, "3"); out-of-turn; unknown seat; move before roll; roll while move pending; unknown/other's/illegal piece; malformed actions; duplicated command; input never mutated; version increments only on success |
| Bonus rolls                            | Six; capture; finish; six+capture capped at one; stacking when configured; unusable six; `onSixWithoutMove` off; six bonus off; none after finishing all pieces                                                                                |
| Three sixes                            | Third six forfeited, turn ends, earlier moves stand; only consecutive sixes count; limit 0 disables; reset on turn change                                                                                                                      |
| Captures                               | Lone opponent sent home; reported in legal moves; none on stars; none on start squares; never own pieces; re-entry needs a 6; capture on entry when starts unsafe; `starts-only`; stack capture when blockades off                             |
| Blockades                              | Cannot land; cannot pass; can stop before; auto-pass when blocked; own pieces pass; block on safe squares; block entry; mixed colours not a blockade; passing-only configuration; disabled; departed players never block                       |
| Finishing                              | Lane turn from 50; exact roll; finished pieces immobile; lane private; 2-player win; 4-player continues to full ranking; skipping finished players; quick-finish ranking                                                                       |
| Players                                | 2 (opposite), 3 (default + custom arrangement), 4; validation; first seat                                                                                                                                                                      |
| Leaving                                | Turn passes; last player wins; leavers ranked last in reverse order; off-turn leave; duplicate leave                                                                                                                                           |
| Simulation                             | 360 complete bot matches (3 profiles × 2/3/4 players × 40 seeds): invariants after every action, termination, full rankings, final board reproducible from events alone; determinism for a seed; coverage of every event type                  |
| Property                               | 300 random command streams (fast-check) mixing legal, illegal and malformed actions: invariants always hold; rejected commands never change state; version +1 per accepted action                                                              |
| Bots / dice / serialisation / protocol | Bots always pick legal moves, take captures/finishes on hard; CSPRNG uniformity; scripted/seeded dice; state round-trip and tamper rejection; room codes; display-name sanitising (Devanagari/Chinese safe); command and join-option schemas   |

## 2. Unit tests — web (`apps/web/test`)

- i18n: every locale has exactly the English key set; ICU placeholders match.
- Encounters: 12 unique directed matchups, durations in 0.8–1.4 s, unique
  attack/reaction pairs, all clip names exist on the proxies.
- Proxies: every species exposes all 10 required states plus its variants;
  skeleton/skin integrity.
- Camera fit: board corners inside the viewport for portrait, landscape, desktop.

## 3. Integration / browser tests (`apps/web/e2e`)

| Spec                  | Verifies                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu.spec.ts`        | Menu modes; navigation; language switch to Hindi and Chinese with persistence; settings persistence; rules page                                                                                                                                    |
| `local-match.spec.ts` | Start a bots match from the menu and roll; capture scenario (victim home, bonus roll, turn kept); winning move → results → play again; **complete bot match to victory**; **human plays a full match via the UI to victory**; leave via pause menu |
| `online.spec.ts`      | Two independent browser contexts: create private room, join by code, ready, start, server dice consistency, move, duplicate-action rejection, reconnection after reload, leave/abandon                                                             |
| `screenshots.spec.ts` | Captures the documentation screenshots (menu, lobby, board, active turn, capture, victory; desktop + phone portrait)                                                                                                                               |

## 4. Multiplayer tests (`apps/game-server/test`)

Colyseus `@colyseus/testing` boot a real server in-process:
join/leave, seat assignment, ready/start, roll authority (clients cannot set
dice), out-of-turn rejection, idempotent `actionId`, stale `expectedVersion`,
malformed payloads, turn timeout auto-play, reconnection keeps the seat,
abandonment removes the seat, match completion and summary persistence hook.

## 5. Acceptance criteria per milestone

- **M1**: a complete match can be played from the main menu to victory with the
  local engine (covered by the two full-match browser tests).
- **M2**: all four animals move through their full animation lifecycle in
  gameplay; all 12 encounters play; missing assets fall back gracefully.
- **M3**: two independent browser contexts complete an online match with
  identical state.
- **M4**: all three languages work; preferences persist; layouts work at phone
  and desktop sizes.
- **M5**: no known critical gameplay, multiplayer or security defects; limitations
  documented.

## 6. Performance checks

Recorded in PROGRESS.md: initial load (menu, game scene), asset build/load time
per species (`template.loadMs`), FPS (drei PerformanceMonitor / `renderer.info`),
draw calls, memory (`performance.memory` in Chromium), reconnect latency.

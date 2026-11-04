# Ludo 3D — project instructions

Realistic 3D multiplayer Ludo with animal pieces. Read this file, then
`docs/PROGRESS.md` (status, known issues, next steps) before doing anything.

## Layout

```
apps/web            Next.js 16 App Router client (React 19, R3F 9, three r187)
apps/game-server    Colyseus 0.18 authoritative server
packages/shared     Pure TS: rules engine, board layout, protocol, themes, bots
docs/               PRD, ARCHITECTURE, GAME_RULES, DECISIONS, ASSET_MANIFEST, TEST_PLAN, PROGRESS
.claude/skills/colyseus   Official Colyseus 0.18 agent skill (read before touching server/SDK code)
```

## Commands (pnpm only — never npm/yarn)

| Task                    | Command                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| Install                 | `pnpm install`                                                                  |
| Web dev (port 3000)     | `pnpm dev:web`                                                                  |
| Server dev (port 2567)  | `pnpm dev:server`                                                               |
| Both                    | `pnpm dev`                                                                      |
| Unit tests (all)        | `pnpm test`                                                                     |
| One project             | `pnpm vitest run --project shared` (`web`, `game-server`)                       |
| Type check              | `pnpm typecheck`                                                                |
| Browser tests           | `pnpm test:e2e` (production build + game server; `E2E_DEV=1` reuses `next dev`) |
| Firebase emulator tests | `pnpm test:firebase` (Auth + Firestore emulators; rules + server integration)   |
| Proxy GLB export        | `pnpm --filter @ludo3d/web assets:proxies`                                      |
| Format                  | `pnpm format`                                                                   |

## Non-negotiable conventions

- **Rules live only in `packages/shared`.** The engine is pure and deterministic:
  no React, three.js, network, `Date` or `Math.random`. Dice values are inputs.
- **Every rule change** needs a `RuleSet` field or profile, a unit test and an
  update to `docs/GAME_RULES.md`.
- **Server is authoritative online.** Never trust client dice, seats, ids or
  positions. Validate payloads with the zod schemas in `@ludo3d/shared/protocol`.
- **Animation never decides outcomes.** The `PresentationController` only
  animates engine events and reconciles to authoritative state.
- **No hard-coded user-facing strings.** Add keys to `apps/web/messages/en.json`
  _and_ `hi.json` _and_ `zh-CN.json` (a unit test enforces key/placeholder parity).
- **Assets are manifest-driven** (`apps/web/src/game/assets/manifest.ts` +
  `docs/ASSET_MANIFEST.md`). Never present proxies as final art.
- **No fake features.** If a backing service is not configured, show it as
  unavailable; never simulate online play or ads.
- Never commit secrets (`.env*` is git-ignored; see `.env.example`).

## Library notes (versions moved past most training data)

- **Next.js 16**: Turbopack default; `cookies()`/`headers()` are async;
  `middleware` → `proxy`; no `next lint`. Docs: `apps/web/node_modules/next/dist/docs/`.
- **Colyseus 0.18 / schema 5**: `defineServer`/`defineRoom`; `messages = {}` map
  with `validate()`; `schema({...}, "Name")` + `t.*`; `client.sessionId` (no
  `client.id`); reconnection via `onDrop` → `allowReconnection` → `onReconnect`;
  client SDK is `@colyseus/sdk` with `Callbacks.get(room)`. See the skill.
- **three r187**: no `PCFSoftShadowMap`; `iridescenceThicknessMinimum/Maximum`.
- **TypeScript 6.0.3** (not 7 — see DECISIONS D-02). **Vitest 5** `projects`.
- **R3F `useFrame` priority**: negative priorities run first without taking over
  rendering; the presentation controller ticks at −1.

## Testing notes

- Headless Chromium uses SwiftShader WebGL (slow). Browser tests pass
  `quality=low` and `speed=N`; E2E builds expose `window.__LUDO__` (read-only
  state + events) and `?scenario=capture|victory|choice` deterministic positions.
- Browser tests default to a production build in `.next-e2e` (port 3100) plus
  the game server (port 2567). `E2E_SKIP_BUILD=1` serves an existing build.
  With `E2E_DEV=1` (next dev), do not edit `apps/web` or `packages/shared`
  during a run — hot reload restarts the match.
- After changing a proxy builder, re-run `assets:proxies` (it skips species the
  manifest marks `final`); `test/glb-assets` checks the committed GLBs load
  with every required clip.
- On-demand suites are excluded from `pnpm test:e2e` unless `E2E_ALL=1`; run
  them with `pnpm --filter @ludo3d/web test:e2e:slow` (full online match),
  `test:e2e:screenshots` (writes `docs/screenshots`) or `test:e2e:perf`
  (writes `docs/perf`).
- `/dev/animals?clip=Walk&t=0.4` renders all four animals for asset review
  (dev/E2E builds only).

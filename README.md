# Ludo 3D

A 3D, multiplayer interpretation of classic Ludo in which the pawns are animals:
**Lion** (yellow), **Peacock** (green), **Horse** (red) and **Fox** (blue). Each
capture plays one of twelve species-specific interactions. Gameplay follows the
traditional rules; online matches are server-authoritative.

> **Development build notice** — the animals are code-built _development
> proxies_ (real skeletons and animation clips, stylised geometry). Final
> realistic, rigged models must be supplied by an artist; see
> [`docs/ASSET_MANIFEST.md`](docs/ASSET_MANIFEST.md). The game labels proxy
> models in the UI.

## What is in the box

|              |                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules engine | Pure, deterministic TypeScript (`packages/shared`): 2/3/4 players, configurable `RuleSet` (default _ClassicIndianDigital_), captures, safe squares, blockades, bonus rolls, three-sixes forfeit, exact finish, rankings, bots |
| 3D client    | Next.js 16 + React Three Fiber: procedural tabletop board, rigged animal proxies with 14 clips each, 12 directed capture encounters, 3D dice, fitted 3/4 isometric camera, quality profiles, reduced motion, procedural audio |
| Modes        | Pass & play, practice vs bots (3 difficulties), online quick match (2/3/4), private rooms with codes and invite links                                                                                                         |
| Server       | Colyseus 0.18: CSPRNG dice, validation, idempotent commands, turn timers, reconnection, seat takeover, abandonment, match summaries                                                                                           |
| Accounts     | Optional Firebase (anonymous guests, Google sign-in, Firestore profiles/history); guests work without it                                                                                                                      |
| Languages    | English, हिन्दी, 简体中文                                                                                                                                                                                                     |

## Quick start

Requirements: Node ≥ 22.12, pnpm 10 (`corepack enable`).

```bash
pnpm install
```

```bash
cp .env.example apps/web/.env.local   # set NEXT_PUBLIC_GAME_SERVER_URL to enable online play
```

```bash
pnpm dev        # web on http://localhost:3000, game server on :2567
```

## Tests

```bash
pnpm typecheck
```

```bash
pnpm test             # rules engine, web units, multiplayer server (Vitest)
```

```bash
pnpm test:e2e         # browser tests (Playwright, production build)
```

```bash
pnpm test:firebase    # security rules + Firebase integration on the emulators
```

## Documentation

| Document                                         | Contents                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                           | Conventions, commands, library notes for contributors and agents  |
| [docs/PROGRESS.md](docs/PROGRESS.md)             | Milestone status, verified results, known limitations, next steps |
| [docs/PRD.md](docs/PRD.md)                       | Product requirements                                              |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | System design and data flow                                       |
| [docs/GAME_RULES.md](docs/GAME_RULES.md)         | Exact rules and variants                                          |
| [docs/DECISIONS.md](docs/DECISIONS.md)           | Architecture decision record                                      |
| [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md) | Models, clips, licences, replacement guide                        |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md)           | Test strategy and coverage                                        |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)         | Hosting, environment, Firebase setup                              |

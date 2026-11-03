# Ludo 3D — Architecture

## 1. Overview

```
┌──────────────────────── apps/web (Next.js 16, React 19) ────────────────────────┐
│  App Router pages (menu, setup, game, lobby, settings, profile, how-to-play)    │
│      │                                                                          │
│  GameScreen ──► GameSession (interface) ◄── LocalSession  (engine in browser)   │
│      │                         ▲        ◄── OnlineSession (Colyseus client)     │
│      ▼                         │ events + authoritative state                   │
│  PresentationController ── animation tasks, display positions, FX, notices      │
│      │                                                                          │
│  GameCanvas (React Three Fiber / three.js): board, animals, dice, camera        │
│  HUD (DOM): panels, roll button, choices, toasts, results                       │
└─────────────────────────────────────────────────────────────────────────────────┘
            │ WebSocket (Colyseus 0.18)            │ HTTPS
            ▼                                      ▼
┌──── apps/game-server (Colyseus) ────┐    ┌──── Firebase (optional) ────┐
│ LudoRoom: authoritative GameState   │    │ Auth: anonymous + Google    │
│ CSPRNG dice, validation, timers,    │──► │ Firestore: profiles,        │
│ reconnection, match summaries       │    │ match summaries             │
└─────────────────────────────────────┘    └─────────────────────────────┘
            ▲
            │ imports
┌──── packages/shared (pure TypeScript) ──────────────────────────────────────────┐
│ board topology & 15×15 layout · RuleSet profiles · reducer (applyAction) ·      │
│ legal moves · events · invariants · zod serialisation · bots · dice sources ·   │
│ network protocol schemas · animal themes                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Separation of concerns:

| Layer                    | Owns                                             | Must not                                      |
| ------------------------ | ------------------------------------------------ | --------------------------------------------- |
| `packages/shared` engine | Rules, legal moves, state transitions, events    | Import React, three.js, network or randomness |
| Game server              | Authoritative state, dice, timing, identity      | Trust any client-supplied outcome             |
| Session (web)            | Talking to an authority (local engine or server) | Animate anything                              |
| PresentationController   | Displayed positions, animation sequencing        | Change game state                             |
| 3D components            | Rendering the display state                      | Contain rules                                 |
| HUD                      | Prompts, buttons, notifications                  | Decide legality (asks the engine)             |

## 2. Shared package (`packages/shared`)

- `board/topology.ts` — progress encoding (−1 yard … 56 finished), start indices,
  star offsets, `trackIndexFor`, `locate`.
- `board/layout.ts` — 15×15 coordinates: 52 track cells (one quadrant rotated
  ×4), lanes, yards, yard slots, finish slots/triangles, travel directions.
- `rules/` — `RuleSet` type, `ClassicIndianDigital` + two variants, zod schema.
- `engine/` — `createGame`, `allocateSeats`, `getLegalMoves`, `applyAction`
  (roll / move / leave), `GameEvent` union, `checkInvariants`,
  `parseGameState` (zod + invariants), `simulateMatch`, `nextAutoAction`.
- `ai/bot.ts` — heuristic bots (captures, finishing, entering, safety, threat
  analysis, blockades) with easy/medium/hard noise levels.
- `random/dice.ts` — seeded PRNG (mulberry32), unbiased CSPRNG dice (rejection
  sampling), scripted dice.
- `protocol/` — room name, room-code alphabet, display-name sanitising, zod
  schemas for every client→server command, server message types, close codes.
- `themes/` — species, `AnimalTheme` (colour → species), encounter ids.

State is immutable plain JSON. `version` increments on every accepted action and
is the basis for idempotency and stale-command rejection online.

## 3. Web client (`apps/web`)

### 3.1 Routing (App Router)

| Route                                   | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `/`                                     | Main menu                                         |
| `/play/local?mode=bots                  | local`                                            | Setup + local match (pass-and-play / bots) |
| `/play/online`                          | Quick match (choose 2/3/4 players)                |
| `/play/friends`                         | Create a private room                             |
| `/join`, `/join/[code]`                 | Enter a code / invitation link                    |
| `/room/[code]`                          | Lobby + online match                              |
| `/settings`, `/how-to-play`, `/profile` | Preferences, localised rules, identity            |
| `/dev/animals`                          | Developer asset review (not in production builds) |

Locale comes from a cookie (no URL prefix); see D-11.

### 3.2 Game screen data flow

1. `GameSession.subscribe` delivers `{snapshot, events, resync?}`.
2. `GameScreen` stores the snapshot (HUD) and hands events to
   `PresentationController.ingest` (or `snapTo` on resync).
3. The controller turns events into generator **tasks** (dice → walk/run along
   the path → encounter → return home → finish celebration → turn change) and
   runs them in `useFrame` at a negative priority (before pieces render).
4. When the queue drains, `onBusyChange(false)` fires: the screen computes legal
   moves for a local seat (highlight rings, choice chips, keyboard 1–4), auto-moves
   if every option is equivalent, and calls `session.notifyPresentationIdle()`
   so local bots act only after the previous animation finished.
5. The final queued task reconciles displayed positions with the authoritative
   state.

### 3.3 3D scene

- Renderer: WebGL via R3F, AgX tone mapping, PCF shadows (quality-dependent),
  `RoomEnvironment` PMREM reflections, warm key light + cool rim.
- Board: procedural (D-07), textures painted on canvas: colour, height→normal
  (Sobel), ORM (occlusion/roughness/metalness).
- Animals: `assetLibrary` loads GLB templates (Meshopt decoder enabled) or falls
  back to code-built rigged proxies; instances are cloned with
  `SkeletonUtils.clone`; `AnimalController` wraps an `AnimationMixer` with state
  → clip resolution, fallbacks, cross-fades and one-shot promises.
- Encounters: `animations/encounters.ts` (12 records) + the controller's generic
  choreography (wind-up, arc/weave approach, impact FX/shake/sound, defender
  exit, run home along a curve).
- Camera: corner-on, elevation 48°, FOV 30°, fit-to-viewport distance, limited
  zoom (wheel/pinch/buttons), subtle impact shake (off in reduced motion).
- Quality profiles: low / medium / high (+ auto with FPS-based step-down via
  drei `PerformanceMonitor`). Low disables shadow maps and uses smaller textures.

### 3.4 UI design system

Plain CSS custom properties (`src/styles/globals.css`) + CSS modules: colour
tokens (warm neutrals, ivory text, one gold accent, four player tints),
typography (Cinzel display, Inter UI, Noto Sans Devanagari / SC fallbacks,
self-hosted via Fontsource), 4-px spacing scale, radii, shadows, focus ring,
button variants (primary/secondary/ghost/danger), cards, segmented controls,
toggles, sliders, modal (focus management, Esc), toasts, spinner, alerts.

### 3.5 State management

- Zustand: `settingsStore` (persisted to localStorage, validated on load,
  hydrated after mount), `toastStore`.
- TanStack Query: server data (profile, match history, server health).
- Local matches are saved to sessionStorage after every action (refresh resumes).

## 4. Game server (`apps/game-server`) — Colyseus 0.18

- `defineServer({ rooms: { ludo: defineRoom(LudoRoom) }, express })` with
  `@colyseus/tools` `listen()`.
- `LudoRoom` state (Schema 5 builder API): lobby players (seat, name, ready,
  connected, host), room phase, and a mirror of the engine `GameState`
  (pieces' progress, turn, dice, rankings, version).
- Authority: every command is zod-validated, checked for seat ownership via the
  `client` argument (never a client-supplied id), idempotency (`actionId` cache),
  staleness (`expectedVersion`), then applied with the shared reducer. Dice:
  shared CSPRNG source on the server.
- Events are broadcast as `game-events {version, events}`; clients animate them
  and reconcile with the synchronised state.
- Turn timers with the bot fallback; reconnection via `onDrop` +
  `allowReconnection`; duplicate connections from the same identity replace the
  older session; abandoned seats are removed with the engine `leave` action.
- Rooms: quick-match rooms filtered by player count; private rooms with a
  6-character code used as the room id; invitation links `/join/<code>`.

## 5. Identity and persistence

- Guest play needs no account. With Firebase configured: anonymous sign-in for
  guests, optional Google sign-in (anonymous accounts can be linked), ID tokens
  verified on the game server with `firebase-admin`. Without Firebase: the game
  server issues signed guest tokens (HMAC-SHA256).
- Firestore (server writes via Admin SDK): `users/{uid}` profile + preferences +
  stats, `matches/{matchId}` summaries. Clients read only their own data
  (security rules in `firestore.rules`). Firestore never stores live match state.
- Region: `asia-south1` (Mumbai) recommended for the production database.

## 6. Timing and pacing (online)

| Item                                                      | Value                        |
| --------------------------------------------------------- | ---------------------------- |
| Reconnection grace period                                 | 45 s                         |
| Roll / move time limit                                    | 20 s (+ animation allowance) |
| Consecutive timeouts before a seat is treated as inactive | 3                            |
| Seat reservation timeout                                  | 15 s                         |

## 7. Scaling notes

A single Colyseus process holds many rooms (each room is small: ≤ 4 clients,
event-driven, no physics). Horizontal scaling later needs
`@colyseus/redis-presence` + `@colyseus/redis-driver` and sticky routing — not
introduced until there is more than one server instance (brief §10).

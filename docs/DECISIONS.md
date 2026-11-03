# Architecture Decision Record

Each entry: context → decision → consequences. Newest last.

## D-01 Monorepo with pnpm workspaces; `packages/shared` instead of `apps/shared`

- **Context**: rules must run identically in the browser (local play, legal-move
  highlighting) and on the server (authority). The brief suggests `apps/shared`.
- **Decision**: pnpm workspace with `apps/web` (Next.js), `apps/game-server`
  (Colyseus) and `packages/shared` (engine, protocol, themes). Libraries live in
  `packages/`, deployables in `apps/` — the usual convention. The shared package
  exports TypeScript source; Turbopack (web), `tsx` (server dev) and esbuild
  (server build) compile it directly, so there is no separate build step.
- **Consequences**: one source of truth for rules; no version skew between client
  and server. pnpm only (`packageManager` pinned); npm/yarn lockfiles are not used.

## D-02 TypeScript 6.0.3 rather than 7.0

- **Context**: `typescript@7.0.2` (the native Go compiler) is "latest". We checked
  its package: the main entry exports only `version` — the classic compiler API
  (`createProgram`, …) moved to `typescript/unstable/sync`.
- **Decision**: pin TypeScript 6.0.3, the last release line with the classic API
  that Next.js's build-time type checking relies on.
- **Consequences**: revisit when Next.js documents TS 7 support.

## D-03 Traditional 15×15 geometry: 5 lane squares + finishing triangle

- **Context**: the brief says "six-cell home columns" and also requires "a
  traditional 15×15 logical grid" and gameplay "faithful to traditional Ludo".
  On a 15×15 board each lane has five coloured squares; the sixth home step is
  the triangle. Six lane squares _plus_ a finish is impossible with a 52-square
  track on that grid without adding a non-traditional extra step.
- **Decision**: home stretch = 5 lane squares + finish (6 steps). Documented in
  GAME_RULES.md §1.1. Topology constants are centralised so a different board
  could be added later.

## D-04 Blockades enabled in the default profile

- **Context**: many Indian mobile apps omit blockades, but the brief explicitly
  requires them "by default".
- **Decision**: `ClassicIndianDigital` has blockades on; an `open-track` profile
  offers the app-style game. Blockades also block start squares (consistent rule).

## D-05 Pure, deterministic engine; randomness injected

- **Decision**: `applyAction(state, action) → {state, events} | error`. Dice values
  are part of the `roll` action, supplied by the authority (server CSPRNG, local
  CSPRNG, or seeded PRNG in tests). No `Date`, no `Math.random` in the engine.
- **Consequences**: replayable matches, property-based tests, server authority
  without trusting clients, identical client/server validation.

## D-06 Events drive animation; state drives truth

- **Decision**: the engine emits ordered events (`dice-rolled`, `piece-moved`,
  `piece-captured`, `bonus-roll`, `turn-started`, …). The web client's
  `PresentationController` animates events and, when its queue drains, reconciles
  the display with the authoritative state (snapping if anything diverged).
- **Consequences**: animation can never change outcomes; missed events (e.g. after
  a reconnect) cannot desynchronise the board.

## D-07 Procedural board instead of `board.glb`

- **Context**: the board must align exactly with the rules engine.
- **Decision**: the board is generated at runtime from the shared layout
  (`packages/shared/src/board/layout.ts`): bevelled walnut slab, a painted enamel
  face with derived normal/roughness/metalness maps (engraved grooves, gold-inlay
  stars, arrows), gold trim, yard pads. `board.glb`/`dice.glb` remain optional
  decorative assets listed in the manifest (not supplied).
- **Consequences**: zero misalignment risk, ~0 MB of board textures to download.

## D-08 Code-built rigged proxies, honestly labelled

- **Context**: production-quality realistic, rigged, animated animal models cannot
  be generated from source code. The brief forbids presenting proxies as final.
- **Decision**: each species is a code-built development proxy with a real
  skeleton (`THREE.Bone`), rigidly skinned `SkinnedMesh`es, and 14 keyframed
  `AnimationClip`s — the same structure a rigged glTF character has. The loader
  always tries `public/assets/animals/<species>.glb` first; the manifest marks
  every animal `status: 'proxy'`, and the HUD shows a "Proxy models" badge while
  any proxy is in use.
- **Consequences**: the whole animation/encounter pipeline is exercised now and
  final assets drop in via the manifest. Realistic look remains blocked on art.

## D-09 Twelve encounters = 4 attack systems × 4 reaction systems × data

- **Decision**: every species has three attack clip variants and three reaction
  clip variants; `ENCOUNTERS` (12 records) pairs them uniquely and adds root
  motion (wind-up, arc, weave, exit direction/distance/hop), timing (0.95–1.4 s),
  FX and sounds. One generic choreography routine plays any record.

## D-10 Fixed corner-on camera, 30° FOV, 48° elevation

- **Decision**: azimuth 45° (a board corner nearest the viewer — the player's own
  yard online, or the single human's yard locally), elevation 48° (brief: 45–55°),
  distance computed per viewport so the whole board always fits; limited zoom
  (0.78–1.12×). Lower elevation was chosen inside the allowed band because it
  makes the diamond shorter on landscape screens, i.e. a larger board.
- **Consequences**: portrait phones show the board smaller (the diamond's
  diagonal spans the width). Documented as a known limitation; zoom helps.

## D-11 next-intl without locale routing

- **Decision**: locale from a `NEXT_LOCALE` cookie (set by the language selector),
  falling back to `Accept-Language`, then English. URLs stay language-neutral so
  invite links work for everyone. English messages are deep-merged under every
  other locale as the fallback.

## D-12 Procedural Web Audio sound

- **Decision**: all sounds (dice, footsteps, vocalisations, music) are synthesised
  at runtime — original, licence-free and tiny. Recorded audio can replace any
  sound id later. Separate music / effects / animal buses and a global mute.

## D-13 Next.js 16 conventions

- Turbopack is the default bundler; `cookies()`/`headers()` are async;
  `middleware` is now `proxy` (unused here); `next lint` was removed, so linting
  is `tsc --noEmit` per package plus Prettier.

## D-14 three.js r187 specifics

- `PCFSoftShadowMap` was removed (falls back to PCF) → we request PCF shadows with
  a blur radius. `iridescenceThicknessRange` → `iridescenceThickness{Minimum,Maximum}`.
- Tone mapping: AgX. Reflections: `RoomEnvironment` through `PMREMGenerator`
  (no HDR download from a CDN).

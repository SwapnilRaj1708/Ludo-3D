# Asset Manifest

Machine-readable source of truth: `apps/web/src/game/assets/manifest.ts`.
This document mirrors it for producers and reviewers.

## Status summary

| Asset   | Path                                  | Status                  | Notes                                                                     |
| ------- | ------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Lion    | `public/assets/animals/lion.glb`      | **Proxy**               | Code-built development proxy (see below). Final realistic model required. |
| Peacock | `public/assets/animals/peacock.glb`   | **Proxy**               | Code-built development proxy. Final realistic model required.             |
| Horse   | `public/assets/animals/horse.glb`     | **Proxy**               | Code-built development proxy. Final realistic model required.             |
| Fox     | `public/assets/animals/fox.glb`       | **Proxy**               | Code-built development proxy. Final realistic model required.             |
| Board   | `public/assets/environment/board.glb` | Not supplied (optional) | The playable board is procedural (DECISIONS D-07).                        |
| Dice    | `public/assets/environment/dice.glb`  | Not supplied (optional) | Procedural rounded resin die with recessed pips.                          |
| Audio   | —                                     | Procedural              | All sounds synthesised at runtime (D-12).                                 |
| Fonts   | npm `@fontsource-variable/*`          | Final                   | Inter, Cinzel, Noto Sans Devanagari, Noto Sans SC — SIL OFL 1.1.          |

**The proxies are not realistic characters.** They are stylised primitive-based
figures with real skeletons and animation clips, built so the complete
animation, encounter and loading pipeline can be developed and tested. The game
shows a "Proxy models" badge whenever any proxy is in use, and the menu states
that the build uses temporary models.

## Animal entries

| Field               | Lion                                                               | Peacock                                | Horse                          | Fox                               |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------- | ------------------------------ | --------------------------------- |
| Asset ID            | `animal.lion`                                                      | `animal.peacock`                       | `animal.horse`                 | `animal.fox`                      |
| Licence/source      | Project-owned, generated in `apps/web/src/game/characters/proxies` | same                                   | same                           | same                              |
| Scale               | 0.84 / 0.94                                                        | 0.84 / 0.70                            | 0.84 / 1.02                    | 0.84 / 0.76                       |
| Rotation correction | 0,0,0 (model faces +Z)                                             | 0,0,0                                  | 0,0,0                          | 0,0,0                             |
| Position correction | 0,0,0 (feet at y=0)                                                | 0,0,0                                  | 0,0,0                          | 0,0,0                             |
| Materials           | PBR + sheen fur stand-in, clearcoat eyes/nose                      | Iridescent plumage, double-sided train | PBR coat + sheen, gloss hooves | PBR fur + sheen, red-fox markings |
| Loading status      | GLB missing → runtime proxy                                        | same                                   | same                           | same                              |

Scale normalises **body length** (nose to rump; for the peacock beak to train tip)
to 0.84 board squares (`TARGET_FOOTPRINT`). Tails curl/droop to stay on the square.

## Required animation clips (every animal)

| State        | Default clip name | Loop | Fallback chain if missing |
| ------------ | ----------------- | ---- | ------------------------- |
| idle         | `Idle`            | yes  | —                         |
| anticipation | `Anticipation`    | yes  | idle                      |
| walk         | `Walk`            | yes  | run → idle                |
| run          | `Run`             | yes  | walk → idle               |
| entry        | `Entry`           | once | land → run → idle         |
| land         | `Land`            | once | idle                      |
| attack       | `Attack`          | once | run → walk → idle         |
| react        | `React`           | once | idle                      |
| returnHome   | `ReturnHome`      | yes  | run → walk → idle         |
| victory      | `Victory`         | yes  | idle                      |

### Encounter variant clips

| Species | Attack variants                                         | Reaction variants                                       |
| ------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Lion    | `Attack` (high pounce), `AttackRoar`, `AttackSwipe`     | `React` (swat & recoil), `ReactStartle`, `ReactRetreat` |
| Peacock | `Attack` (flap-jump), `AttackDisplay`, `AttackPeck`     | `React` (defensive fan), `ReactFlutter`, `ReactScatter` |
| Horse   | `Attack` (charge & stomp), `AttackRear`, `AttackGallop` | `React` (startle kick), `ReactRear`, `ReactShy`         |
| Fox     | `Attack` (mouse pounce), `AttackDart`, `AttackNip`      | `React` (yelp hop), `ReactDodge`, `ReactRoll`           |

A missing variant falls back to the base `Attack` / `React` clip. Missing clips
are reported by `assetLibrary` (`template.missingClips`).

## Twelve directed encounters

Defined in `apps/web/src/game/animations/encounters.ts`.

| Attacker → Defender | Attack clip   | Reaction clip | Duration | Choreography                                   |
| ------------------- | ------------- | ------------- | -------- | ---------------------------------------------- |
| Lion → Peacock      | Attack        | ReactFlutter  | 1.20 s   | Controlled high pounce; flutter-jump backwards |
| Lion → Horse        | AttackRoar    | ReactRear     | 1.35 s   | Roar, low charge; horse rears                  |
| Lion → Fox          | AttackSwipe   | ReactDodge    | 1.00 s   | Low stalk and paw swipe; fox leaps aside       |
| Peacock → Lion      | AttackDisplay | ReactStartle  | 1.40 s   | Shimmering train display; lion sits back       |
| Peacock → Horse     | Attack        | ReactShy      | 1.10 s   | Wings-spread flap-jump and peck; horse shies   |
| Peacock → Fox       | AttackPeck    | React         | 1.00 s   | Three rapid pecks; fox yelps and hops back     |
| Horse → Lion        | AttackRear    | ReactRetreat  | 1.30 s   | Rears and strikes; lion retreats crouching     |
| Horse → Peacock     | AttackGallop  | ReactScatter  | 1.10 s   | Galloping charge, head toss; peacock scatters  |
| Horse → Fox         | Attack        | ReactRoll     | 1.15 s   | Charge and stomp; fox tumbles clear            |
| Fox → Lion          | AttackDart    | React         | 0.95 s   | Feints and a darting snap; lion swats          |
| Fox → Peacock       | Attack        | React         | 1.15 s   | Arcing mouse-pounce; peacock fans defensively  |
| Fox → Horse         | AttackNip     | React         | 1.00 s   | Circling nip at the heels; horse kicks out     |

All interactions are non-graphic: no blood or injury; the defender is startled
and runs back to its yard.

## Specification for final production models

- glTF 2.0 binary (`.glb`), Y-up, facing +Z, metres not required (scale corrected
  in the manifest), feet on the ground plane.
- Rigged skeleton with skinned mesh(es); ≤ 70 bones; ≤ 25k triangles per animal
  for mobile (LOD optional); textures ≤ 2048² (KTX2/BasisU encouraged).
- PBR metallic-roughness materials; fur/feathers via cards or groomed textures;
  peacock iridescence via `KHR_materials_iridescence`.
- Clips named as above (or remap names in the manifest). Root motion should be
  in place (the game moves the root).
- Compress with `gltf-transform` (`meshopt` + `ktx2`); the loader already enables
  the Meshopt decoder.
- Licence must allow commercial use and modification; record source and licence
  in `manifest.ts` and here.

## Replacing a proxy

1. Drop the file at the listed path.
2. Update the entry in `manifest.ts`: `status: 'final'`, `source`, `licence`,
   `scale`/`rotation`/`position` corrections, clip-name map.
3. Open `/dev/animals?clip=Walk` (dev build) to review every clip at once.
4. Run the browser test suite.

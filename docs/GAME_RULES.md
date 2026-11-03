# Ludo 3D — Game Rules

This document is the human-readable specification of the rules engine in
`packages/shared/src/engine`. Every rule below is implemented as data in a
`RuleSet` (`packages/shared/src/rules`) and covered by unit tests in
`packages/shared/test`. If the code and this document disagree, that is a bug.

## 1. Board and seats

### 1.1 Geometry (traditional 15 × 15 grid)

| Element              | Count              | Notes                                                  |
| -------------------- | ------------------ | ------------------------------------------------------ |
| Shared track         | 52 squares         | Clockwise loop around the cross-shaped track           |
| Home lane per colour | 5 squares          | The coloured middle column of the player's own arm     |
| Finishing triangle   | 1 per colour       | The player's quarter of the central 3 × 3 square       |
| Starting yard        | 4 slots per colour | 6 × 6 corner area                                      |
| Start squares        | 4                  | First track square outside each yard (coloured, arrow) |
| Star squares         | 4                  | Eight squares after each start square                  |

Each piece's position is one integer, `progress`, relative to its own seat:

| progress | Meaning                        |
| -------- | ------------------------------ |
| −1       | In the starting yard           |
| 0        | On its own start square        |
| 1 … 50   | Further along the shared track |
| 51 … 55  | In its own home lane           |
| 56       | Finished (home triangle)       |

A piece therefore travels 50 squares past its start square, turns into its lane
from the square directly in front of its lane (relative 50), and needs six more
steps (five lane squares + the triangle) to finish. It never visits the shared
square directly behind its own start square.

> **Home-stretch interpretation.** The product brief describes "six-cell home
> columns". On the traditional 15 × 15 board the home stretch is six _steps_:
> five coloured lane squares plus the finishing triangle. We implement that
> traditional geometry (see DECISIONS.md D-03). A literal six-square lane plus a
> separate finish would add a non-traditional extra step.

### 1.2 Seats, colours and animals

Seats are numbered clockwise from the north-west yard. Turn order and movement
are both clockwise.

| Seat | Corner | Colour | Animal (Animal Kingdom theme) | Start square (global) |
| ---- | ------ | ------ | ----------------------------- | --------------------- |
| 0    | NW     | Yellow | Lion                          | 0                     |
| 1    | NE     | Green  | Peacock                       | 13                    |
| 2    | SE     | Red    | Horse                         | 26                    |
| 3    | SW     | Blue   | Fox                           | 39                    |

The colour → animal mapping is configuration (`packages/shared/src/themes`).

### 1.3 Seat-allocation policy

| Players | Seats used                     | Rationale                                                                       |
| ------- | ------------------------------ | ------------------------------------------------------------------------------- |
| 2       | Yellow (0) and Red (2)         | Opposite corners — equal distance in both directions                            |
| 3       | Yellow (0), Green (1), Red (2) | Default; any three distinct seats may be configured (`allocateSeats(3, [...])`) |
| 4       | All seats                      | —                                                                               |

Absent seats have no pieces and are skipped in turn order. The first turn goes
to the first participating seat clockwise from NW unless the caller chooses
another participant (online rooms pick it at random on the server).

## 2. The `ClassicIndianDigital` profile (default)

Id: `classic-indian-digital`.

1. **Turns** pass clockwise. On your turn you roll one six-sided die.
2. **Entering**: a piece leaves the yard only on a **6**, and is placed on its own
   start square. Entering consumes the roll (the piece does not move further).
3. **Moving**: otherwise you must move one piece exactly the number rolled.
   You choose which legally movable piece to move.
4. **No legal move**: the roll is resolved automatically. If it was a six, the six's
   bonus roll is still granted (see 6); otherwise the turn passes.
5. **Captures**: landing on a square holding a lone opponent piece sends it back
   to its yard. A captured piece needs another 6 to re-enter. You never capture
   your own pieces (they share the square).
6. **Bonus rolls**: rolling a **6**, **capturing**, or **bringing a piece home** each
   earn an extra roll. **At most one bonus roll is granted per move**, even if
   several reasons apply (e.g. a 6 that also captures).
7. **Three consecutive sixes**: the third six in a row within one turn is
   **forfeited** — it is not played and the turn ends immediately. Moves already
   completed with the first two sixes **stand**.
8. **Safe squares**: the four start squares and the four star squares. Pieces on
   them cannot be captured; several colours may share them.
9. **Blockades**: two or more pieces of the same colour on one square form a
   blockade. Opponents may **neither pass through nor land on** it — including on
   safe squares and on start squares (an opponent blockade on your start square
   prevents you from entering). Your own pieces may pass your blockades. Two
   different colours sharing a safe square are not a blockade.
10. **Home lane**: only the owner can enter it, so lane squares are always safe.
11. **Exact finish**: you must roll the exact number to reach the finishing
    triangle; overshooting is not allowed (that piece cannot move with that roll).
12. **Finished pieces** never move again.
13. **Winning**: a player who brings all four pieces home is ranked in finishing
    order. The match continues until only one player is left unfinished
    (`endCondition: all-but-one`), who takes last place. A player who finishes
    receives no further turns (and no bonus roll for the final piece).
14. **Leaving**: a player who leaves (or is removed after disconnecting beyond
    the grace period) has their pieces removed from the board and is ranked
    below everyone still playing; among leavers, the most recent leaver ranks
    higher. If only one player remains, the match ends and they win.

## 3. Configurable rules (`RuleSet`)

| Field                        | ClassicIndianDigital | Meaning                                                        |
| ---------------------------- | -------------------- | -------------------------------------------------------------- |
| `entryRolls`                 | `[6]`                | Dice values that let a piece leave the yard                    |
| `bonusRoll.onSix`            | `true`               | A six grants a bonus roll                                      |
| `bonusRoll.onCapture`        | `true`               | A capture grants a bonus roll                                  |
| `bonusRoll.onFinish`         | `true`               | Bringing a piece home grants a bonus roll                      |
| `bonusRoll.maxPerMove`       | `1`                  | Cap on bonus rolls from one move                               |
| `bonusRoll.onSixWithoutMove` | `true`               | An unusable six still grants its bonus roll                    |
| `consecutiveSixes.limit`     | `3`                  | Sixes in a row that trigger the policy (0 = off)               |
| `consecutiveSixes.policy`    | `forfeit-roll`       | Void the limit-reaching roll, end the turn, keep earlier moves |
| `blockade.enabled`           | `true`               | Same-colour stacks form blockades                              |
| `blockade.minPieces`         | `2`                  | Pieces needed for a blockade                                   |
| `blockade.blocksPassing`     | `true`               | Opponents cannot move past a blockade                          |
| `blockade.blocksLanding`     | `true`               | Opponents cannot finish a move on a blockade                   |
| `safeSquares`                | `starts-and-stars`   | `starts-and-stars`, `starts-only` or `none`                    |
| `endCondition`               | `all-but-one`        | `all-but-one` (full ranking) or `first-winner`                 |

When blockades are disabled, a piece landing on a non-safe square captures
**every** opponent piece there. When start squares are not safe, entering onto
an opponent captures it.

### 3.1 Bundled profiles

| Id                       | Difference from the default                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic-indian-digital` | — (default)                                                                                                                                              |
| `open-track`             | Blockades disabled                                                                                                                                       |
| `quick-finish`           | `endCondition: first-winner` — the match ends when the first player finishes; the others are ranked by pieces home, then total progress, then seat order |

## 4. Differences from other established variants

| Variant                          | Typical difference                                                                     | Our default                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Popular Indian mobile apps       | Usually no blockades; captures allowed on all non-star squares                         | Blockades **on** (required by the brief); use `open-track` for the app-style game |
| Traditional board-game Ludo (UK) | Often no star squares; some versions need a 6 to leave and award no bonus for captures | Stars safe, capture bonus on                                                      |
| Pachisi / Parcheesi              | Two dice, blockades, different board and safe squares                                  | Single die, 15 × 15 Ludo board                                                    |
| "Kill to enter home" variants    | A player must capture at least once before entering the home lane                      | Not implemented (could be a future `RuleSet` flag)                                |
| Some apps                        | Three sixes send the moved piece back or cancel the whole turn                         | Third six is void; earlier moves stand                                            |
| Some apps                        | Game ends at first winner                                                              | Continue to full ranking (configurable)                                           |

## 5. Online-only procedures (not engine rules)

These are enforced by the game server, not the pure engine:

- Dice are generated on the server with a CSPRNG (`crypto.getRandomValues` with
  rejection sampling); clients can never supply a dice value.
- Each turn phase has a time limit; on timeout the server performs the action a
  bot would (roll, or the bot's best move). Repeated timeouts mark the player
  inactive. See ARCHITECTURE.md §6.
- When exactly one distinct move is available, clients auto-play it (player
  setting); the server still validates it like any other move.

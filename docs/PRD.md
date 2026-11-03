# Ludo 3D — Product Requirements

## Vision

A premium, realistic 3D interpretation of classic Ludo in which each player's
four pawns are animated animals (Animal Kingdom theme: Lion, Peacock, Horse,
Fox). Gameplay stays faithful to traditional Ludo; the innovation is visual and
experiential — animals walk the board and play a distinct interaction when one
captures another. Commercial, advertising-supported free-to-play product.

## Principles

1. Correct Ludo gameplay before visual effects.
2. Realistic 3D presentation is a core differentiator.
3. Online play is server-authoritative.
4. The board is always readable.
5. Runs well on ordinary phones.
6. Rules, characters and configuration are modular data.
7. No fake functionality, placeholder buttons or simulated online play.
8. Every important feature is testable.

## Players and modes

| Mode                  | Players                  | Notes                                    |
| --------------------- | ------------------------ | ---------------------------------------- |
| Quick match (online)  | 2, 3 or 4 real players   | Matched by requested size                |
| Private room (online) | 2–4                      | Room code + invitation link, host starts |
| Practice vs bots      | 1 human + 1–3 bots       | Easy / medium / hard                     |
| Pass & play           | 2–4 humans on one device | Any seat can be a bot                    |

Guest play requires no account. Accounts (Firebase) are optional and add a
persistent name, preferences, statistics and match history.

## Functional requirements (checklist)

Status is tracked in `docs/PROGRESS.md` — an item is complete only when it is
implemented **and** verified by a test or an inspected browser run.

### Gameplay

- [ ] F1 Complete classic Ludo engine with configurable `RuleSet` (GAME_RULES.md)
- [ ] F2 2-, 3- and 4-player games with documented seat allocation
- [ ] F3 Legal move generation and highlighting; tap/click/keyboard selection
- [ ] F4 Bonus rolls, three-sixes forfeit, captures, safe squares, blockades, exact finish
- [ ] F5 Rankings, results screen, play again / restart
- [ ] F6 Bots (three difficulties)

### Presentation

- [ ] P1 3D tabletop board (wood, enamel, bevels, engraving) aligned with the engine
- [ ] P2 Fixed 3/4 isometric camera (≈45° azimuth, 45–55° elevation), limited zoom
- [ ] P3 Four animal types × four pieces with 10 animation states
- [ ] P4 Twelve distinct directed capture interactions (0.8–1.4 s)
- [ ] P5 3D dice; result decided before animation
- [ ] P6 Quality profiles (low/medium/high/auto), reduced-motion mode
- [ ] P7 Realistic final animal assets (**requires external art**)

### Online

- [ ] O1 Colyseus authoritative rooms (server dice, validation, idempotency)
- [ ] O2 Quick match by size; private rooms with codes and invite links
- [ ] O3 Lobby: seats, names, colours, animals, ready, host start
- [ ] O4 Reconnection, refresh recovery, duplicate connections, abandonment, turn timers
- [ ] O5 Match summaries persisted (when Firestore is configured)

### Product

- [ ] U1 Main menu, settings, how-to-play, profile
- [ ] U2 English, Hindi, Simplified Chinese; persisted language
- [ ] U3 Audio: dice, footsteps, vocalisations, capture, finish, victory, UI, music; independent volumes + mute
- [ ] U4 Firebase guest + Google sign-in; server-side token verification
- [ ] U5 Analytics and advertising abstractions (no SDKs; consent-gated; never during live play)
- [ ] U6 Responsive phone portrait/landscape and desktop layouts

## Non-functional requirements

- 60 fps target on capable phones; degrade via quality profiles.
- Initial load: menu interactive quickly; 3D scene lazy-loaded.
- Security: no secrets in the client, server validation of every action, token
  verification, Firestore rules, rate limits.
- Privacy: collect only what product analytics needs; no tracking before consent.

## Out of scope for the first release

Real advertising SDKs, purchases, leaderboards, achievements, seasonal events,
additional themes (architecture supports them).

## Success metrics to validate (not assumptions)

Match completion rate, D1/D7 retention, session length, online match failure and
reconnect rates. Historical market DAU figures are not treated as demand.

import * as THREE from 'three';
import {
  FINISH_PROGRESS,
  LAST_TRACK_PROGRESS,
  YARD_PROGRESS,
  isOnTrack,
  speciesForSeat,
  trackDirection,
  trackIndexFor,
  type AnimalTheme,
  type BonusReason,
  type GameEvent,
  type GameState,
  type PieceId,
  type PieceIndex,
  type SeatIndex,
  type Species,
} from '@ludo3d/shared';
import type { AnimState } from '../characters/animStates';
import {
  BOARD_SURFACE_Y,
  spotKey,
  spotWorld,
  stackLayout,
  yawFromDirection,
} from '../rendering/coords';
import { getEncounter, type FxKind, type SoundId } from './encounters';
import { call, during, easeInOut, easeOut, parallel, wait, type Task } from './tasks';

export interface AnimRequest {
  loop: AnimState;
  loopClip?: string;
  loopTimeScale: number;
  loopSeq: number;
  once?: { state: AnimState; clip?: string; timeScale: number; seq: number };
}

export interface PieceVisual {
  id: PieceId;
  seat: SeatIndex;
  index: PieceIndex;
  species: Species;
  /** Logical position currently shown. */
  progress: number;
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
  target: { pos: THREE.Vector3; yaw: number; scale: number };
  /** True while a task drives this piece directly. */
  owned: boolean;
  hidden: boolean;
  opacity: number;
  anim: AnimRequest;
}

export interface DiceVisual {
  seat: SeatIndex;
  value: number;
  rolling: boolean;
  rollId: number;
  visible: boolean;
  /** Seconds the roll animation lasts (for the 3D dice). */
  duration: number;
}

export interface FxParticle {
  kind: FxKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  color: THREE.Color;
}

export type PresentationNotice =
  | { kind: 'rolled'; seat: SeatIndex; value: number }
  | { kind: 'no-moves'; seat: SeatIndex; value: number }
  | { kind: 'forfeit'; seat: SeatIndex }
  | { kind: 'bonus'; seat: SeatIndex; reasons: readonly BonusReason[] }
  | { kind: 'capture'; seat: SeatIndex; victimSeat: SeatIndex; attacker: Species; victim: Species }
  | { kind: 'piece-home'; seat: SeatIndex; species: Species }
  | { kind: 'player-finished'; seat: SeatIndex; rank: number }
  | { kind: 'player-left'; seat: SeatIndex }
  | { kind: 'turn'; seat: SeatIndex }
  | { kind: 'game-over'; winner: SeatIndex | null; rankings: readonly SeatIndex[] };

export interface PresentationOptions {
  theme: AnimalTheme;
  reducedMotion: boolean;
  /** Multiplies all animation time (1 = normal; tests use larger values). */
  speed: number;
  clipDuration: (species: Species, state: AnimState, clip?: string) => number;
  onNotice?: (notice: PresentationNotice) => void;
  onSound?: (
    id: SoundId | 'dice-roll' | 'step' | 'enter' | 'home' | 'victory',
    at?: THREE.Vector3,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
  onDisplayChange?: () => void;
}

const WALK_SPEED = 2.7; // board squares per second
const RUN_SPEED = 4.3;
const DICE_DURATION = 0.85;

const tmpA = new THREE.Vector3();

function angleLerp(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function worldOf(seat: SeatIndex, progress: number, index: PieceIndex): THREE.Vector3 {
  const w = spotWorld(seat, progress, index);
  return new THREE.Vector3(w.x, BOARD_SURFACE_Y, w.z);
}

/**
 * Presentation layer: consumes authoritative game events and plays them back
 * as sequenced animation. It owns *displayed* positions only; the engine
 * state is never modified here, and when the queue drains the display is
 * reconciled with the latest authoritative state.
 */
export class PresentationController {
  readonly pieces = new Map<PieceId, PieceVisual>();
  readonly dice: DiceVisual = {
    seat: 0,
    value: 1,
    rolling: false,
    rollId: 0,
    visible: false,
    duration: DICE_DURATION,
  };
  readonly fx: FxParticle[] = [];
  shake = 0;
  activeSeat: SeatIndex;
  private queue: (() => Task)[] = [];
  private current: Task | null = null;
  private latest: GameState;
  private busy = false;
  private seq = 1;

  constructor(
    initial: GameState,
    private options: PresentationOptions,
  ) {
    this.latest = initial;
    this.activeSeat = initial.turn.seat;
    for (const p of initial.pieces) {
      const pos = worldOf(p.seat, p.progress, p.index);
      this.pieces.set(p.id, {
        id: p.id,
        seat: p.seat,
        index: p.index,
        species: speciesForSeat(options.theme, p.seat),
        progress: p.progress,
        pos: pos.clone(),
        yaw: 0,
        scale: 1,
        target: { pos: pos.clone(), yaw: 0, scale: 1 },
        owned: false,
        hidden: initial.players.find((pl) => pl.seat === p.seat)?.status === 'left',
        opacity: 1,
        anim: { loop: 'idle', loopTimeScale: 1, loopSeq: 0 },
      });
    }
    this.relayout(true);
  }

  setOptions(patch: Partial<PresentationOptions>) {
    this.options = { ...this.options, ...patch };
  }

  get speed() {
    return this.options.speed;
  }

  isBusy() {
    return this.busy;
  }

  get state(): GameState {
    return this.latest;
  }

  // -------------------------------------------------------------------------
  // Event intake
  // -------------------------------------------------------------------------

  ingest(events: readonly GameEvent[], state: GameState) {
    this.latest = state;
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      switch (e.type) {
        case 'dice-rolled':
          this.enqueue(() => this.diceTask(e.seat, e.value));
          break;
        case 'roll-forfeited':
          this.enqueue(() => this.noticeTask({ kind: 'forfeit', seat: e.seat }, 0.9));
          break;
        case 'no-legal-moves':
          this.enqueue(() =>
            this.noticeTask({ kind: 'no-moves', seat: e.seat, value: e.value }, 0.55),
          );
          break;
        case 'piece-moved': {
          const captures: Extract<GameEvent, { type: 'piece-captured' }>[] = [];
          while (events[i + 1]?.type === 'piece-captured') {
            captures.push(events[++i] as Extract<GameEvent, { type: 'piece-captured' }>);
          }
          this.enqueue(() => this.moveTask(e, captures));
          break;
        }
        case 'piece-finished':
          this.enqueue(() => this.homeTask(e.pieceId));
          break;
        case 'bonus-roll':
          this.enqueue(() =>
            this.noticeTask({ kind: 'bonus', seat: e.seat, reasons: e.reasons }, 0.15),
          );
          break;
        case 'turn-started':
          this.enqueue(() => this.turnTask(e.seat));
          break;
        case 'player-finished':
          this.enqueue(() =>
            this.noticeTask({ kind: 'player-finished', seat: e.seat, rank: e.rank }, 0.6),
          );
          break;
        case 'player-left':
          this.enqueue(() => this.leftTask(e.seat));
          break;
        case 'game-over':
          this.enqueue(() => this.gameOverTask(e.winner, e.rankings));
          break;
        default:
          break;
      }
    }
    this.enqueue(() => this.reconcileTask());
  }

  /** Jump straight to a state without animation (initial load, reconnection). */
  snapTo(state: GameState) {
    this.queue = [];
    this.current = null;
    this.latest = state;
    this.activeSeat = state.turn.seat;
    for (const p of state.pieces) {
      const view = this.pieces.get(p.id);
      if (!view) continue;
      view.progress = p.progress;
      view.owned = false;
      view.hidden = state.players.find((pl) => pl.seat === p.seat)?.status === 'left';
    }
    this.relayout(true);
    this.setBusy(false);
  }

  private enqueue(factory: () => Task) {
    this.queue.push(factory);
    this.setBusy(true);
  }

  private setBusy(busy: boolean) {
    if (busy !== this.busy) {
      this.busy = busy;
      this.options.onBusyChange?.(busy);
    }
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(rawDt: number) {
    const dt = Math.min(rawDt, 0.25) * this.options.speed;
    // Run queued tasks. When a task finishes during this frame the next one
    // starts immediately and receives the same frame time, so slow frames
    // (old phones, software rendering) do not stretch sequences out.
    for (let guard = 0; guard < 12; guard++) {
      if (!this.current) {
        const next = this.queue.shift();
        if (!next) break;
        this.current = next();
        if (this.current.next().done) {
          this.current = null;
          continue;
        }
      }
      if (this.current.next(dt).done) {
        this.current = null;
        continue;
      }
      break;
    }
    if (!this.current && this.queue.length === 0) this.setBusy(false);

    const ease = 1 - Math.exp(-dt * 10);
    for (const view of this.pieces.values()) {
      if (view.owned) continue;
      view.pos.lerp(view.target.pos, ease);
      view.yaw = angleLerp(view.yaw, view.target.yaw, ease);
      view.scale += (view.target.scale - view.scale) * ease;
      const targetOpacity = view.hidden ? 0 : 1;
      view.opacity += (targetOpacity - view.opacity) * ease;
    }

    this.updateFx(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private facing(view: PieceVisual): number {
    if (view.progress === YARD_PROGRESS || view.progress === FINISH_PROGRESS) {
      // Look towards the centre of the board.
      return yawFromDirection(-view.target.pos.x, -view.target.pos.z);
    }
    if (isOnTrack(view.progress)) {
      const dir = trackDirection(trackIndexFor(view.seat, view.progress));
      // At the home-entry square, face into the lane.
      if (view.progress === LAST_TRACK_PROGRESS) {
        const lane = worldOf(view.seat, LAST_TRACK_PROGRESS + 1, view.index);
        return yawFromDirection(lane.x - view.target.pos.x, lane.z - view.target.pos.z);
      }
      return yawFromDirection(dir.x, dir.y);
    }
    return yawFromDirection(-view.target.pos.x, -view.target.pos.z);
  }

  /** Recomputes resting targets, spreading pieces that share a square. */
  relayout(immediate = false) {
    const groups = new Map<string, PieceVisual[]>();
    for (const view of this.pieces.values()) {
      if (view.hidden) continue;
      const key = spotKey(view.seat, view.progress, view.index);
      const list = groups.get(key) ?? [];
      list.push(view);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.seat - b.seat || a.index - b.index);
      const layout = stackLayout(list.length);
      list.forEach((view, i) => {
        const base = worldOf(view.seat, view.progress, view.index);
        const off = layout.offsets[i] ?? { x: 0, z: 0 };
        view.target.pos.set(base.x + off.x, BOARD_SURFACE_Y, base.z + off.z);
        view.target.scale = layout.scale;
        view.target.yaw = this.facing(view);
        if (immediate && !view.owned) {
          view.pos.copy(view.target.pos);
          view.yaw = view.target.yaw;
          view.scale = view.target.scale;
        }
      });
    }
    this.options.onDisplayChange?.();
  }

  // -------------------------------------------------------------------------
  // Animation requests consumed by the 3D pieces
  // -------------------------------------------------------------------------

  setLoop(view: PieceVisual, state: AnimState, timeScale = 1, clip?: string) {
    if (
      view.anim.loop === state &&
      view.anim.loopClip === clip &&
      view.anim.loopTimeScale === timeScale
    )
      return;
    view.anim = {
      ...view.anim,
      loop: state,
      loopClip: clip,
      loopTimeScale: timeScale,
      loopSeq: this.seq++,
    };
  }

  playOnce(view: PieceVisual, state: AnimState, clip?: string, timeScale = 1) {
    view.anim = { ...view.anim, once: { state, clip, timeScale, seq: this.seq++ } };
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  private *noticeTask(notice: PresentationNotice, hold: number): Task {
    this.options.onNotice?.(notice);
    yield* wait(this.options.reducedMotion ? Math.min(hold, 0.3) : hold);
  }

  private *diceTask(seat: SeatIndex, value: number): Task {
    const duration = this.options.reducedMotion ? 0.25 : DICE_DURATION;
    Object.assign(this.dice, {
      seat,
      value,
      rolling: true,
      visible: true,
      duration,
      rollId: this.dice.rollId + 1,
    });
    this.options.onSound?.('dice-roll');
    yield* wait(duration);
    this.dice.rolling = false;
    this.options.onNotice?.({ kind: 'rolled', seat, value });
    yield* wait(0.18);
  }

  private *turnTask(seat: SeatIndex): Task {
    this.activeSeat = seat;
    this.options.onNotice?.({ kind: 'turn', seat });
    yield* wait(0.12);
  }

  /** Moves a piece along world points at constant speed, facing the direction of travel. */
  private *walk(view: PieceVisual, points: THREE.Vector3[], speed: number, state: AnimState): Task {
    if (points.length === 0) return;
    const clipCycle = this.options.clipDuration(view.species, state);
    // Match stride to ground speed so feet do not slide (≈0.9 squares per cycle).
    this.setLoop(view, state, Math.max(0.6, Math.min(2.2, (speed * clipCycle) / 0.95)));
    // One timed segment over the whole polyline (parameterised by distance) so
    // a long frame can advance several squares at once.
    const nodes = [view.pos.clone(), ...points];
    const cumulative = [0];
    for (let i = 1; i < nodes.length; i++) {
      cumulative.push(cumulative[i - 1]! + nodes[i]!.distanceTo(nodes[i - 1]!));
    }
    const total = cumulative[cumulative.length - 1]!;
    let squaresPassed = 0;
    yield* during(total / speed, (k, dt) => {
      const d = k * total;
      let i = 1;
      while (i < nodes.length - 1 && cumulative[i]! < d) i++;
      const a = nodes[i - 1]!;
      const b = nodes[i]!;
      const segLength = cumulative[i]! - cumulative[i - 1]!;
      const t = segLength > 0 ? (d - cumulative[i - 1]!) / segLength : 1;
      view.pos.lerpVectors(a, b, Math.min(1, Math.max(0, t)));
      view.yaw = angleLerp(
        view.yaw,
        yawFromDirection(b.x - a.x, b.z - a.z),
        1 - Math.exp(-dt * 14),
      );
      const reached = cumulative.filter((c, j) => j > 0 && c <= d + 1e-6).length;
      if (reached > squaresPassed) {
        squaresPassed = reached;
        this.options.onSound?.('step', view.pos);
      }
    });
    view.pos.copy(nodes[nodes.length - 1]!);
    this.setLoop(view, 'idle');
  }

  /** Parabolic hop between two points. */
  private *hop(view: PieceVisual, to: THREE.Vector3, height: number, duration: number): Task {
    const start = view.pos.clone();
    const yaw = yawFromDirection(to.x - start.x, to.z - start.z);
    yield* during(duration, (k, dt) => {
      const e = easeInOut(k);
      view.pos.lerpVectors(start, to, e);
      view.pos.y = BOARD_SURFACE_Y + Math.sin(Math.PI * k) * height;
      if (start.distanceToSquared(to) > 0.0004)
        view.yaw = angleLerp(view.yaw, yaw, 1 - Math.exp(-dt * 12));
    });
    view.pos.y = BOARD_SURFACE_Y;
  }

  private *moveTask(
    e: Extract<GameEvent, { type: 'piece-moved' }>,
    captures: Extract<GameEvent, { type: 'piece-captured' }>[],
  ): Task {
    const view = this.pieces.get(e.pieceId);
    if (!view) return;
    view.owned = true;
    const reduced = this.options.reducedMotion;

    if (e.kind === 'enter') {
      this.options.onSound?.('enter', view.pos);
      const target = worldOf(view.seat, 0, view.index);
      if (reduced) {
        view.pos.copy(target);
      } else {
        this.playOnce(view, 'entry');
        yield* wait(0.18);
        yield* this.hop(view, target, 0.55, 0.55);
        this.playOnce(view, 'land');
        this.spawnFx('dust', target, 5);
        yield* wait(0.12);
      }
      view.progress = 0;
      if (captures.length > 0) yield* this.encounter(view, captures, target, target);
    } else {
      const points = e.path.map((p) => worldOf(view.seat, p, view.index));
      const finishing = e.kind === 'finish';
      // The final step onto a victim, or into the home triangle, is choreographed separately.
      const walkPoints = captures.length > 0 || finishing ? points.slice(0, -1) : points;
      const style: AnimState = e.path.length >= 5 ? 'run' : 'walk';
      const speed = (style === 'run' ? RUN_SPEED : WALK_SPEED) * (reduced ? 2 : 1);
      yield* this.walk(view, walkPoints, speed, style);
      const last = points[points.length - 1]!;
      if (captures.length > 0) {
        const from = view.pos.clone();
        yield* this.encounter(view, captures, from, last);
      } else if (finishing) {
        yield* this.hop(view, last, 0.4, reduced ? 0.2 : 0.45);
      }
      view.progress = e.to;
    }

    view.owned = false;
    this.relayout();
    yield* wait(0.06);
  }

  /** Capture choreography: attacker strikes, defenders react and run home. */
  private *encounter(
    attacker: PieceVisual,
    captures: Extract<GameEvent, { type: 'piece-captured' }>[],
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): Task {
    const victims = captures
      .map((c) => this.pieces.get(c.victimId))
      .filter((v): v is PieceVisual => !!v);
    if (victims.length === 0) return;
    const first = victims[0]!;
    const config = getEncounter(attacker.species, first.species);
    this.options.onNotice?.({
      kind: 'capture',
      seat: attacker.seat,
      victimSeat: first.seat,
      attacker: attacker.species,
      victim: first.species,
    });
    for (const v of victims) v.owned = true;

    if (this.options.reducedMotion) {
      this.spawnFx('dust', to, 4);
      this.options.onSound?.(config.sfx.impact, to);
      attacker.pos.copy(to);
      yield* wait(0.15);
      for (const v of victims) v.progress = YARD_PROGRESS;
      yield* parallel(...victims.map((v) => this.returnHome(v, true)));
      return;
    }

    const duration = config.duration;
    const impact = duration * config.impactAt;
    const attackDir = to.clone().sub(from);
    if (attackDir.lengthSq() < 1e-6) attackDir.set(0, 0, 1);
    attackDir.normalize();
    const side = new THREE.Vector3(-attackDir.z, 0, attackDir.x);
    const faceAttacker = yawFromDirection(-attackDir.x, -attackDir.z);
    const faceDefender = yawFromDirection(attackDir.x, attackDir.z);

    // Clip time scales stretch each species' variant to fit the shared timeline.
    const attackLen = this.options.clipDuration(attacker.species, 'attack', config.attackClip);
    this.playOnce(attacker, 'attack', config.attackClip, attackLen / duration);
    if (config.sfx.windup) this.options.onSound?.(config.sfx.windup, from);

    const victimStarts = victims.map((v) => v.pos.clone());
    const exitTargets = victims.map((v, i) => {
      const dir =
        config.exit.direction === 'back' ? attackDir : side.clone().multiplyScalar(i % 2 ? -1 : 1);
      return v.pos.clone().addScaledVector(dir, config.exit.distance);
    });
    let impacted = false;
    let reacted = false;

    yield* during(duration, (k, dt) => {
      const t = k * duration;
      // Attacker root motion: hold during wind-up, then travel with an arc to the square.
      const moveStart = Math.min(config.approach.windup, impact * 0.9);
      const mk =
        t <= moveStart ? 0 : Math.min(1, (t - moveStart) / Math.max(0.05, impact - moveStart));
      const e = easeInOut(mk);
      attacker.pos.lerpVectors(from, to, e);
      attacker.pos.y = BOARD_SURFACE_Y + Math.sin(Math.PI * e) * config.approach.arc;
      if (config.approach.weave) {
        attacker.pos.addScaledVector(side, Math.sin(e * Math.PI * 2) * config.approach.weave);
      }
      attacker.yaw = angleLerp(attacker.yaw, faceDefender, 1 - Math.exp(-dt * 16));

      // Defenders turn to face the threat, react near impact, then get displaced.
      victims.forEach((v, i) => {
        v.yaw = angleLerp(v.yaw, faceAttacker, 1 - Math.exp(-dt * 10));
        const exitStart = impact + config.exit.delay;
        if (t >= exitStart) {
          const xk = easeOut(Math.min(1, (t - exitStart) / Math.max(0.1, duration - exitStart)));
          v.pos.lerpVectors(victimStarts[i]!, exitTargets[i]!, xk);
          v.pos.y = BOARD_SURFACE_Y + Math.sin(Math.PI * xk) * config.exit.hop;
        }
      });

      if (!reacted && t >= impact - 0.12) {
        reacted = true;
        for (const v of victims) {
          const reactLen = this.options.clipDuration(v.species, 'react', config.reactClip);
          this.playOnce(
            v,
            'react',
            config.reactClip,
            reactLen / Math.max(0.4, duration - impact + 0.12),
          );
        }
      }
      if (!impacted && t >= impact) {
        impacted = true;
        this.options.onSound?.(config.sfx.impact, to);
        this.options.onSound?.(config.sfx.defender, to);
        for (const [kind, count] of Object.entries(config.fx)) {
          this.spawnFx(kind as FxKind, to, count ?? 0);
        }
        this.shake = Math.max(this.shake, config.shake);
      }
    });
    attacker.pos.copy(to);
    this.setLoop(attacker, 'idle');
    for (const v of victims) v.progress = YARD_PROGRESS;
    yield* parallel(...victims.map((v) => this.returnHome(v, false)));
  }

  /** The captured animal runs back to its own yard slot. */
  private *returnHome(view: PieceVisual, instant: boolean): Task {
    view.owned = true;
    const home = worldOf(view.seat, YARD_PROGRESS, view.index);
    if (instant) {
      yield* during(0.2, (k) => {
        view.opacity = 1 - k;
      });
      view.pos.copy(home);
      yield* during(0.2, (k) => {
        view.opacity = k;
      });
    } else {
      const distance = view.pos.distanceTo(home);
      const duration = Math.min(1.5, Math.max(0.7, distance / 9));
      this.setLoop(view, 'returnHome', 1.2);
      const start = view.pos.clone();
      // Curve the run outward so it does not cut through other pieces.
      const mid = start.clone().lerp(home, 0.5);
      mid.addScaledVector(tmpA.set(mid.x, 0, mid.z).normalize(), 1.2);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, home);
      yield* during(duration, (k, dt) => {
        const e = easeInOut(k);
        curve.getPoint(e, view.pos);
        const ahead = curve.getPoint(Math.min(1, e + 0.02));
        view.yaw = angleLerp(
          view.yaw,
          yawFromDirection(ahead.x - view.pos.x, ahead.z - view.pos.z),
          1 - Math.exp(-dt * 12),
        );
        view.pos.y = BOARD_SURFACE_Y + Math.abs(Math.sin(k * Math.PI * 5)) * 0.04;
      });
      view.pos.copy(home);
      this.playOnce(view, 'land');
      this.setLoop(view, 'idle');
    }
    view.owned = false;
    this.relayout();
  }

  private *homeTask(pieceId: PieceId): Task {
    const view = this.pieces.get(pieceId);
    if (!view) return;
    this.options.onSound?.('home', view.pos);
    this.spawnFx('sparkle', view.pos, 14);
    this.options.onNotice?.({ kind: 'piece-home', seat: view.seat, species: view.species });
    if (!this.options.reducedMotion) {
      this.playOnce(view, 'victory');
      yield* wait(0.7);
      this.setLoop(view, 'idle');
    }
  }

  private *leftTask(seat: SeatIndex): Task {
    for (const view of this.pieces.values()) {
      if (view.seat === seat && view.progress !== FINISH_PROGRESS) {
        view.hidden = true;
      }
    }
    this.options.onNotice?.({ kind: 'player-left', seat });
    this.relayout();
    yield* wait(0.3);
  }

  private *gameOverTask(winner: SeatIndex | null, rankings: readonly SeatIndex[]): Task {
    if (winner !== null) {
      for (const view of this.pieces.values()) {
        if (view.seat === winner) {
          this.setLoop(view, 'victory');
          this.spawnFx('sparkle', view.pos, 10);
        }
      }
      this.options.onSound?.('victory');
    }
    yield* wait(this.options.reducedMotion ? 0.3 : 1.4);
    this.options.onNotice?.({ kind: 'game-over', winner, rankings });
  }

  /** Make the display match the authoritative state exactly. */
  private *reconcileTask(): Task {
    let changed = false;
    for (const piece of this.latest.pieces) {
      const view = this.pieces.get(piece.id);
      if (!view) continue;
      const left = this.latest.players.find((pl) => pl.seat === piece.seat)?.status === 'left';
      if (view.progress !== piece.progress || view.hidden !== left) {
        view.progress = piece.progress;
        view.hidden = left;
        changed = true;
      }
    }
    if (this.latest.status === 'playing') this.activeSeat = this.latest.turn.seat;
    if (changed) this.relayout();
    yield* call(() => this.options.onDisplayChange?.());
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------

  spawnFx(kind: FxKind, at: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const particle: FxParticle = {
        kind,
        pos: new THREE.Vector3(
          at.x + Math.cos(a) * 0.15 * r,
          BOARD_SURFACE_Y + 0.05,
          at.z + Math.sin(a) * 0.15 * r,
        ),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.8,
        size: 0.1,
        spin: (Math.random() - 0.5) * 8,
        color: new THREE.Color(),
      };
      if (kind === 'dust') {
        particle.vel.set(Math.cos(a) * 0.9, 0.35 + Math.random() * 0.3, Math.sin(a) * 0.9);
        particle.maxLife = 0.6 + Math.random() * 0.4;
        particle.size = 0.12 + Math.random() * 0.1;
        particle.color.set('#b9a184');
      } else if (kind === 'feathers') {
        particle.pos.y += 0.25;
        particle.vel.set(Math.cos(a) * 1.1, 0.8 + Math.random() * 0.8, Math.sin(a) * 1.1);
        particle.maxLife = 1.1 + Math.random() * 0.5;
        particle.size = 0.06 + Math.random() * 0.04;
        particle.color.set(Math.random() > 0.5 ? '#2a68c9' : '#3f7a3a');
      } else {
        particle.pos.y += 0.2;
        particle.vel.set(Math.cos(a) * 0.4, 0.9 + Math.random() * 0.8, Math.sin(a) * 0.4);
        particle.maxLife = 0.9 + Math.random() * 0.5;
        particle.size = 0.05 + Math.random() * 0.04;
        particle.color.set(Math.random() > 0.3 ? '#ffd98a' : '#fff4dd');
      }
      this.fx.push(particle);
    }
    if (this.fx.length > 240) this.fx.splice(0, this.fx.length - 240);
  }

  private updateFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.fx.splice(i, 1);
        continue;
      }
      if (p.kind === 'dust') {
        p.vel.multiplyScalar(1 - dt * 3);
        p.size += dt * 0.25;
      } else if (p.kind === 'feathers') {
        p.vel.y -= dt * 2.2;
        p.vel.x *= 1 - dt * 1.5;
        p.vel.z *= 1 - dt * 1.5;
        p.vel.y = Math.max(p.vel.y, -0.35);
      } else {
        p.vel.y -= dt * 1.2;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < BOARD_SURFACE_Y + 0.01) p.pos.y = BOARD_SURFACE_Y + 0.01;
    }
  }
}

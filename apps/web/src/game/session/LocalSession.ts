import {
  BOT_DIFFICULTIES,
  CLASSIC_INDIAN_DIGITAL,
  applyAction,
  createCryptoDice,
  createGame,
  createScriptedDice,
  createSeededRandom,
  diceFromRandom,
  getRuleProfile,
  isSeatIndex,
  nextAutoAction,
  parseGameState,
  type BotDifficulty,
  type DiceSource,
  type GameAction,
  type GameState,
  type PieceId,
  type RandomSource,
  type SeatIndex,
} from '@ludo3d/shared';
import { readSession, writeSession } from '@/utils/storage';
import type { GameSession, SeatInfo, SessionSnapshot, SessionUpdate } from './types';

export interface LocalSeatConfig {
  seat: SeatIndex;
  controller: 'human' | 'bot';
  name: string;
  difficulty?: BotDifficulty;
}

export interface LocalGameConfig {
  mode: 'bots' | 'local';
  seats: LocalSeatConfig[];
  ruleProfileId: string;
  /** Deterministic dice + bots (tests, replays). Omit for true randomness. */
  seed?: number;
}

const STORAGE_KEY = 'ludo3d.localMatch.v1';
const BOT_DELAY_MS = 520;

interface StoredMatch {
  config: LocalGameConfig;
  state: unknown;
  startedAt: number;
}

export function loadStoredLocalMatch(): {
  config: LocalGameConfig;
  state: GameState;
  startedAt: number;
} | null {
  const raw = readSession(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredMatch;
    const state = parseGameState(stored.state);
    if (!state || state.status !== 'playing' || !validConfig(stored.config)) return null;
    return { config: stored.config, state, startedAt: stored.startedAt };
  } catch {
    return null;
  }
}

export function clearStoredLocalMatch() {
  writeSession(STORAGE_KEY, null);
}

function validConfig(config: unknown): config is LocalGameConfig {
  const c = config as LocalGameConfig;
  return (
    !!c &&
    (c.mode === 'bots' || c.mode === 'local') &&
    Array.isArray(c.seats) &&
    c.seats.length >= 2 &&
    c.seats.length <= 4 &&
    c.seats.every(
      (s) =>
        isSeatIndex(s.seat) &&
        (s.controller === 'human' || s.controller === 'bot') &&
        typeof s.name === 'string' &&
        (s.difficulty === undefined || BOT_DIFFICULTIES.includes(s.difficulty)),
    ) &&
    typeof c.ruleProfileId === 'string'
  );
}

/**
 * Runs a match entirely in the browser with the shared engine: pass-and-play
 * and practice against bots. Dice come from the Web Crypto CSPRNG unless a
 * seed is supplied. The match is saved to sessionStorage after every action so
 * a page refresh resumes it.
 */
export class LocalSession implements GameSession {
  readonly kind = 'local' as const;
  private state: GameState;
  private readonly listeners = new Set<(u: SessionUpdate) => void>();
  private readonly dice: DiceSource;
  private readonly random: RandomSource;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  readonly startedAt: number;
  private speed = 1;

  constructor(
    readonly config: LocalGameConfig,
    options: {
      resume?: { state: GameState; startedAt: number };
      /** Test scenario: a prepared position and scripted dice (E2E builds only). */
      scenario?: { state: GameState; dice: readonly number[] };
    } = {},
  ) {
    const rules = getRuleProfile(config.ruleProfileId) ?? CLASSIC_INDIAN_DIGITAL;
    this.state =
      options.resume?.state ??
      options.scenario?.state ??
      createGame({ seats: config.seats.map((s) => s.seat), rules });
    this.startedAt = options.resume?.startedAt ?? Date.now();
    let dice: DiceSource;
    if (config.seed !== undefined) {
      const seeded = createSeededRandom(config.seed);
      dice = diceFromRandom(seeded);
      this.random = createSeededRandom(config.seed ^ 0x9e3779b9);
    } else {
      dice = createCryptoDice();
      this.random = { next: () => Math.random() };
    }
    this.dice = options.scenario ? createScriptedDice(options.scenario.dice, dice) : dice;
    this.persist();
  }

  /** Speeds up bot pacing together with animations (tests, impatient players). */
  setSpeed(speed: number) {
    this.speed = Math.max(0.25, speed);
  }

  getSnapshot(): SessionSnapshot {
    return { state: this.state, seats: this.seatInfo() };
  }

  private seatInfo(): SeatInfo[] {
    return this.config.seats.map((s) => ({
      seat: s.seat,
      name: s.name,
      controller: s.controller,
      isLocal: s.controller === 'human',
      difficulty: s.difficulty,
      connected: true,
    }));
  }

  subscribe(listener: (u: SessionUpdate) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private controllerOf(seat: SeatIndex) {
    return this.config.seats.find((s) => s.seat === seat)?.controller;
  }

  private apply(action: GameAction): boolean {
    if (this.disposed) return false;
    const result = applyAction(this.state, action);
    if (!result.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[local] rejected', action, result.error, result.message);
      }
      return false;
    }
    this.state = result.state;
    this.persist();
    const update: SessionUpdate = { snapshot: this.getSnapshot(), events: result.events };
    for (const l of this.listeners) l(update);
    return true;
  }

  roll(seat: SeatIndex) {
    if (this.controllerOf(seat) !== 'human' || this.state.turn.seat !== seat) return;
    if (this.state.turn.phase !== 'awaiting-roll') return;
    this.apply({ type: 'roll', seat, value: this.dice.roll() });
  }

  move(seat: SeatIndex, pieceId: PieceId) {
    if (this.controllerOf(seat) !== 'human') return;
    this.apply({ type: 'move', seat, pieceId });
  }

  /** Bots act only once the previous action has finished animating. */
  notifyPresentationIdle() {
    if (this.botTimer || this.disposed || this.state.status !== 'playing') return;
    const seat = this.state.turn.seat;
    const cfg = this.config.seats.find((s) => s.seat === seat);
    if (cfg?.controller !== 'bot') return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.disposed || this.state.turn.seat !== seat) return;
      const action = nextAutoAction(this.state, {
        dice: this.dice,
        random: this.random,
        difficulty: cfg.difficulty ?? 'medium',
      });
      if (action) this.apply(action);
    }, BOT_DELAY_MS / this.speed);
  }

  private persist() {
    if (this.state.status !== 'playing') {
      clearStoredLocalMatch();
      return;
    }
    const stored: StoredMatch = {
      config: this.config,
      state: this.state,
      startedAt: this.startedAt,
    };
    writeSession(STORAGE_KEY, JSON.stringify(stored));
  }

  dispose() {
    this.disposed = true;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.listeners.clear();
  }
}

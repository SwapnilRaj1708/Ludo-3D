import type { DiceValue } from '../rules/types';
import { isDiceValue } from '../rules/types';

/** A uniform random float source in [0, 1). */
export interface RandomSource {
  next(): number;
}

export interface SeededRandom extends RandomSource {
  /** Internal state; pass to `createSeededRandom` to resume the sequence. */
  getState(): number;
}

/**
 * Small, fast, deterministic PRNG (mulberry32). Used for local play replays,
 * bots and tests — never for online dice, which use a CSPRNG on the server.
 */
export function createSeededRandom(seed: number): SeededRandom {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState() {
      return a;
    },
  };
}

export interface DiceSource {
  roll(): DiceValue;
}

export function diceFromRandom(random: RandomSource): DiceSource {
  return {
    roll() {
      return (1 + Math.floor(random.next() * 6)) as DiceValue;
    },
  };
}

/**
 * Unbiased dice backed by the Web Crypto CSPRNG (available in browsers and in
 * Node ≥ 19 as `globalThis.crypto`). Uses rejection sampling so every face has
 * exactly equal probability.
 */
export function createCryptoDice(): DiceSource {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) throw new Error('Web Crypto is not available');
  const buffer = new Uint8Array(1);
  return {
    roll() {
      // 252 is the largest multiple of 6 below 256.
      for (;;) {
        crypto.getRandomValues(buffer);
        const byte = buffer[0]!;
        if (byte < 252) return ((byte % 6) + 1) as DiceValue;
      }
    },
  };
}

/** Replays a fixed sequence of values (tests, tutorials, demos). */
export function createScriptedDice(values: readonly number[], fallback?: DiceSource): DiceSource {
  let i = 0;
  return {
    roll() {
      if (i < values.length) {
        const value = values[i++];
        if (!isDiceValue(value)) throw new Error(`Scripted dice value ${value} is invalid`);
        return value;
      }
      if (fallback) return fallback.roll();
      throw new Error('Scripted dice exhausted');
    },
  };
}

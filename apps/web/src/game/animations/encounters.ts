import type { EncounterId, Species } from '@ludo3d/shared';

/**
 * Twelve directed capture interactions (product spec §8).
 *
 * Rather than twelve bespoke animation engines, each matchup is a data
 * record combining: the attacker species' attack system (its attack clip
 * variant + approach root motion), the defender species' reaction system (its
 * reaction clip variant + exit root motion), and shared choreography timing.
 * Every pair below is unique, so every matchup reads differently. All
 * behaviour is non-graphic: the defender is startled and retreats home.
 */
export type ExitDirection = 'back' | 'side';
export type FxKind = 'dust' | 'feathers' | 'sparkle';
export type SoundId =
  | 'lion-roar'
  | 'lion-growl'
  | 'peacock-call'
  | 'peacock-rustle'
  | 'horse-whinny'
  | 'horse-snort'
  | 'fox-yip'
  | 'fox-bark'
  | 'impact-soft'
  | 'impact-heavy'
  | 'whoosh';

export interface EncounterConfig {
  id: EncounterId;
  attacker: Species;
  defender: Species;
  /** Short description of the choreography (also shown in docs). */
  summary: string;
  attackClip: string;
  reactClip: string;
  /** Total interaction length in seconds (spec target 0.8–1.4 s). */
  duration: number;
  /** Fraction of `duration` at which contact happens. */
  impactAt: number;
  approach: {
    /** Seconds spent winding up (crouch, roar, feints, fan) before moving. */
    windup: number;
    /** Peak height of the attacker's leap in board units. */
    arc: number;
    /** Lateral weave amplitude during the approach (fox circling). */
    weave?: number;
  };
  exit: {
    direction: ExitDirection;
    /** How far the defender is displaced before running home. */
    distance: number;
    hop: number;
    /** Delay after impact before the defender moves (seconds). */
    delay: number;
  };
  fx: Partial<Record<FxKind, number>>;
  /** Camera shake intensity (0 disables; always 0 in reduced-motion mode). */
  shake: number;
  sfx: { windup?: SoundId; impact: SoundId; defender: SoundId };
}

const E = (c: Omit<EncounterConfig, 'id'>): EncounterConfig => ({
  ...c,
  id: `${c.attacker}>${c.defender}`,
});

export const ENCOUNTERS: readonly EncounterConfig[] = [
  E({
    attacker: 'lion',
    defender: 'peacock',
    summary: 'Controlled high pounce; the peacock bursts into a flutter-jump backwards.',
    attackClip: 'Attack',
    reactClip: 'ReactFlutter',
    duration: 1.2,
    impactAt: 0.62,
    approach: { windup: 0.3, arc: 0.45 },
    exit: { direction: 'back', distance: 0.45, hop: 0.35, delay: 0.02 },
    fx: { feathers: 16, dust: 6 },
    shake: 0.12,
    sfx: { windup: 'lion-growl', impact: 'impact-soft', defender: 'peacock-call' },
  }),
  E({
    attacker: 'lion',
    defender: 'horse',
    summary: 'A full roar, then a low driving charge; the horse rears in alarm.',
    attackClip: 'AttackRoar',
    reactClip: 'ReactRear',
    duration: 1.35,
    impactAt: 0.7,
    approach: { windup: 0.45, arc: 0.06 },
    exit: { direction: 'back', distance: 0.5, hop: 0.05, delay: 0.1 },
    fx: { dust: 12 },
    shake: 0.18,
    sfx: { windup: 'lion-roar', impact: 'impact-heavy', defender: 'horse-whinny' },
  }),
  E({
    attacker: 'lion',
    defender: 'fox',
    summary: 'Low stalk and a sweeping paw swipe; the fox leaps nimbly aside.',
    attackClip: 'AttackSwipe',
    reactClip: 'ReactDodge',
    duration: 1.0,
    impactAt: 0.6,
    approach: { windup: 0.35, arc: 0.02 },
    exit: { direction: 'side', distance: 0.5, hop: 0.3, delay: 0 },
    fx: { dust: 7 },
    shake: 0.08,
    sfx: { windup: 'lion-growl', impact: 'whoosh', defender: 'fox-yip' },
  }),
  E({
    attacker: 'peacock',
    defender: 'lion',
    summary: 'Dramatic shimmering train display; the startled lion sits back and withdraws.',
    attackClip: 'AttackDisplay',
    reactClip: 'ReactStartle',
    duration: 1.4,
    impactAt: 0.55,
    approach: { windup: 0.4, arc: 0 },
    exit: { direction: 'back', distance: 0.4, hop: 0.08, delay: 0.05 },
    fx: { sparkle: 18 },
    shake: 0.04,
    sfx: { windup: 'peacock-rustle', impact: 'peacock-call', defender: 'lion-growl' },
  }),
  E({
    attacker: 'peacock',
    defender: 'horse',
    summary: 'Wings-spread flap-jump with a peck; the horse shies sideways.',
    attackClip: 'Attack',
    reactClip: 'ReactShy',
    duration: 1.1,
    impactAt: 0.58,
    approach: { windup: 0.1, arc: 0.35 },
    exit: { direction: 'side', distance: 0.45, hop: 0.08, delay: 0.04 },
    fx: { feathers: 8, dust: 4 },
    shake: 0.06,
    sfx: { windup: 'peacock-rustle', impact: 'impact-soft', defender: 'horse-snort' },
  }),
  E({
    attacker: 'peacock',
    defender: 'fox',
    summary: 'Three rapid pecks; the fox yelps and hops backwards.',
    attackClip: 'AttackPeck',
    reactClip: 'React',
    duration: 1.0,
    impactAt: 0.45,
    approach: { windup: 0.15, arc: 0.05 },
    exit: { direction: 'back', distance: 0.4, hop: 0.25, delay: 0.06 },
    fx: { feathers: 5, dust: 3 },
    shake: 0.05,
    sfx: { impact: 'impact-soft', defender: 'fox-yip' },
  }),
  E({
    attacker: 'horse',
    defender: 'lion',
    summary: 'Rears high and strikes down with the forehooves; the lion retreats in a crouch.',
    attackClip: 'AttackRear',
    reactClip: 'ReactRetreat',
    duration: 1.3,
    impactAt: 0.72,
    approach: { windup: 0.45, arc: 0.12 },
    exit: { direction: 'back', distance: 0.45, hop: 0.05, delay: 0.05 },
    fx: { dust: 16 },
    shake: 0.2,
    sfx: { windup: 'horse-whinny', impact: 'impact-heavy', defender: 'lion-growl' },
  }),
  E({
    attacker: 'horse',
    defender: 'peacock',
    summary: 'A short galloping charge with a head toss; the peacock flares and scatters.',
    attackClip: 'AttackGallop',
    reactClip: 'ReactScatter',
    duration: 1.1,
    impactAt: 0.55,
    approach: { windup: 0, arc: 0.06 },
    exit: { direction: 'side', distance: 0.55, hop: 0.2, delay: 0.02 },
    fx: { dust: 10, feathers: 10 },
    shake: 0.12,
    sfx: { impact: 'impact-heavy', defender: 'peacock-call' },
  }),
  E({
    attacker: 'horse',
    defender: 'fox',
    summary: 'Forward charge ending in a double stomp; the fox tumbles evasively clear.',
    attackClip: 'Attack',
    reactClip: 'ReactRoll',
    duration: 1.15,
    impactAt: 0.66,
    approach: { windup: 0.15, arc: 0.15 },
    exit: { direction: 'side', distance: 0.5, hop: 0.15, delay: 0 },
    fx: { dust: 14 },
    shake: 0.15,
    sfx: { windup: 'horse-snort', impact: 'impact-heavy', defender: 'fox-bark' },
  }),
  E({
    attacker: 'fox',
    defender: 'lion',
    summary: 'Agile feints left and right, then a darting snap; the lion swats and recoils.',
    attackClip: 'AttackDart',
    reactClip: 'React',
    duration: 0.95,
    impactAt: 0.6,
    approach: { windup: 0.4, arc: 0.08 },
    exit: { direction: 'back', distance: 0.35, hop: 0.04, delay: 0.08 },
    fx: { dust: 5 },
    shake: 0.06,
    sfx: { windup: 'fox-yip', impact: 'whoosh', defender: 'lion-roar' },
  }),
  E({
    attacker: 'fox',
    defender: 'peacock',
    summary: 'The fox’s signature arcing mouse-pounce; the peacock fans defensively and retreats.',
    attackClip: 'Attack',
    reactClip: 'React',
    duration: 1.15,
    impactAt: 0.62,
    approach: { windup: 0.28, arc: 0.6 },
    exit: { direction: 'back', distance: 0.4, hop: 0.12, delay: 0.04 },
    fx: { feathers: 12, dust: 5 },
    shake: 0.08,
    sfx: { windup: 'fox-bark', impact: 'impact-soft', defender: 'peacock-rustle' },
  }),
  E({
    attacker: 'fox',
    defender: 'horse',
    summary: 'Quick circling manoeuvre and a nip at the heels; the horse kicks out and sidesteps.',
    attackClip: 'AttackNip',
    reactClip: 'React',
    duration: 1.0,
    impactAt: 0.52,
    approach: { windup: 0.2, arc: 0, weave: 0.18 },
    exit: { direction: 'side', distance: 0.45, hop: 0.06, delay: 0.05 },
    fx: { dust: 9 },
    shake: 0.1,
    sfx: { windup: 'fox-yip', impact: 'whoosh', defender: 'horse-whinny' },
  }),
];

const BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));

/**
 * Same-species "encounters" cannot happen in the Animal Kingdom theme (each
 * colour has a different animal) but other themes might; they fall back to a
 * neutral pounce/flinch.
 */
export function getEncounter(attacker: Species, defender: Species): EncounterConfig {
  return (
    BY_ID.get(`${attacker}>${defender}`) ?? {
      id: `${attacker}>${defender}`,
      attacker,
      defender,
      summary: 'Generic pounce and retreat',
      attackClip: 'Attack',
      reactClip: 'React',
      duration: 1.0,
      impactAt: 0.6,
      approach: { windup: 0.25, arc: 0.2 },
      exit: { direction: 'back', distance: 0.4, hop: 0.1, delay: 0.05 },
      fx: { dust: 6 },
      shake: 0.08,
      sfx: { impact: 'impact-soft', defender: 'whoosh' },
    }
  );
}

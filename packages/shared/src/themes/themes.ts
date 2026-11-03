import { PLAYER_COLORS, SEAT_COLOR, type PlayerColor, type SeatIndex } from '../constants/seats';

export const SPECIES = ['lion', 'peacock', 'horse', 'fox'] as const;
export type Species = (typeof SPECIES)[number];

export function isSpecies(value: unknown): value is Species {
  return typeof value === 'string' && (SPECIES as readonly string[]).includes(value);
}

/**
 * A theme maps every player colour to the animal species that represents it.
 * Themes are data so that new animal sets can be added without touching the
 * rules engine, networking or rendering code.
 */
export interface AnimalTheme {
  readonly id: string;
  readonly speciesByColor: Readonly<Record<PlayerColor, Species>>;
}

export const ANIMAL_KINGDOM_THEME: AnimalTheme = Object.freeze({
  id: 'animal-kingdom',
  speciesByColor: Object.freeze({
    yellow: 'lion',
    green: 'peacock',
    red: 'horse',
    blue: 'fox',
  }),
});

export const THEMES: Readonly<Record<string, AnimalTheme>> = Object.freeze({
  [ANIMAL_KINGDOM_THEME.id]: ANIMAL_KINGDOM_THEME,
});

export const DEFAULT_THEME_ID = ANIMAL_KINGDOM_THEME.id;

export function getTheme(id: string | undefined): AnimalTheme {
  return (id && Object.prototype.hasOwnProperty.call(THEMES, id) ? THEMES[id] : undefined) ??
    ANIMAL_KINGDOM_THEME;
}

export function speciesForSeat(theme: AnimalTheme, seat: SeatIndex): Species {
  return theme.speciesByColor[SEAT_COLOR[seat]];
}

/** Directed encounter id, e.g. `lion>peacock` (attacker > defender). */
export type EncounterId = `${Species}>${Species}`;

export function encounterId(attacker: Species, defender: Species): EncounterId {
  return `${attacker}>${defender}`;
}

/** All directed matchups between distinct species (12 for four species). */
export function allEncounterIds(theme: AnimalTheme = ANIMAL_KINGDOM_THEME): EncounterId[] {
  const species = PLAYER_COLORS.map((c) => theme.speciesByColor[c]);
  const ids: EncounterId[] = [];
  for (const a of species) for (const d of species) if (a !== d) ids.push(encounterId(a, d));
  return ids;
}

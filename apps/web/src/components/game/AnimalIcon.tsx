import type { Species } from '@ludo3d/shared';

/** Simple original silhouette marks used in the HUD (not character art). */
const PATHS: Record<Species, string> = {
  lion: 'M12 3c-3.6 0-6.6 2.3-7.6 5.6-.9.4-1.6 1.3-1.6 2.4 0 .9.4 1.6 1.1 2.1.6 3.6 3.9 6.4 8.1 6.4s7.5-2.8 8.1-6.4c.7-.5 1.1-1.2 1.1-2.1 0-1.1-.7-2-1.6-2.4C18.6 5.3 15.6 3 12 3zm-2.6 8.2a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm5.2 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zM12 16.5c-1.2 0-2.1-.8-2.1-1.6 0-.5.9-.8 2.1-.8s2.1.3 2.1.8c0 .8-.9 1.6-2.1 1.6z',
  peacock:
    'M12.6 2.2c-.4 0-.7.3-.7.7v1c-1.2.3-2 1.4-2 2.6 0 .9.4 1.6 1 2.1L9.6 11c-2.6.6-4.6 2.9-4.6 5.7 0 .9.2 1.8.6 2.5l-1.8 2.1h3.1l1.1-1.2c.9.6 2 .9 3.1.9h3.6l2.2 1.2v-2.4c1.7-1.1 2.8-2.9 2.8-5 0-2.6-1.8-4.9-4.3-5.6l-.7-2.6c.7-.5 1.1-1.3 1.1-2.1 0-1.1-.7-2.1-1.7-2.5V2.9c0-.4-.3-.7-.7-.7zm.4 3.4a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z',
  horse:
    'M15.2 2.5l-1.4 1.8c-3.5.4-6.3 3-7 6.5l-2.6 4.4c-.4.7-.2 1.6.4 2 .5.4 1.2.4 1.7 0l2.8-2.1.9 1.7-1.2 4.7h7.6l-.9-4.5c2.4-1.5 3.9-4.2 3.9-7.2V5.2l-1.6-.6-.4-2.1h-2.2zm1.1 4.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z',
  fox: 'M4 3l2.3 6.3C5.5 10.3 5 11.6 5 13c0 3.9 3.1 7 7 7s7-3.1 7-7c0-1.4-.5-2.7-1.3-3.7L20 3l-5.3 3.4c-.8-.3-1.8-.4-2.7-.4s-1.9.1-2.7.4L4 3zm5.4 8.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5.2 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM12 15.6l1.4 1.2c-.4.4-.9.6-1.4.6s-1-.2-1.4-.6l1.4-1.2z',
};

export function AnimalIcon({
  species,
  size = 22,
  color = 'currentColor',
}: {
  species: Species;
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={PATHS[species]} fill={color} />
    </svg>
  );
}

export function DieFace({ value, size = 28 }: { value: number; size?: number }) {
  const pips: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [
      [7, 7],
      [17, 17],
    ],
    3: [
      [7, 7],
      [12, 12],
      [17, 17],
    ],
    4: [
      [7, 7],
      [17, 7],
      [7, 17],
      [17, 17],
    ],
    5: [
      [7, 7],
      [17, 7],
      [12, 12],
      [7, 17],
      [17, 17],
    ],
    6: [
      [7, 7],
      [17, 7],
      [7, 12],
      [17, 12],
      [7, 17],
      [17, 17],
    ],
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={String(value)}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#f6f0e3" stroke="#c9b48a" />
      {(pips[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill="#7a1414" />
      ))}
    </svg>
  );
}

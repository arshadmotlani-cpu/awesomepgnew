/** Per-floor accent identity in Room Theater — stable by floor number. */
export type FloorColor = {
  accent: string;
  accentMuted: string;
  glow: string;
  label: string;
};

const FLOOR_PALETTE: FloorColor[] = [
  {
    accent: '#ff5a1f',
    accentMuted: 'rgba(255, 90, 31, 0.15)',
    glow: 'rgba(255, 90, 31, 0.45)',
    label: 'Floor A',
  },
  {
    accent: '#22d3ee',
    accentMuted: 'rgba(34, 211, 238, 0.12)',
    glow: 'rgba(34, 211, 238, 0.4)',
    label: 'Floor B',
  },
  {
    accent: '#a78bfa',
    accentMuted: 'rgba(167, 139, 250, 0.14)',
    glow: 'rgba(167, 139, 250, 0.38)',
    label: 'Floor C',
  },
  {
    accent: '#34d399',
    accentMuted: 'rgba(52, 211, 153, 0.12)',
    glow: 'rgba(52, 211, 153, 0.35)',
    label: 'Floor D',
  },
  {
    accent: '#fbbf24',
    accentMuted: 'rgba(251, 191, 36, 0.12)',
    glow: 'rgba(251, 191, 36, 0.38)',
    label: 'Floor E',
  },
  {
    accent: '#f472b6',
    accentMuted: 'rgba(244, 114, 182, 0.12)',
    glow: 'rgba(244, 114, 182, 0.35)',
    label: 'Floor F',
  },
];

export function getFloorColor(floorNumber: number): FloorColor {
  const idx = ((floorNumber % FLOOR_PALETTE.length) + FLOOR_PALETTE.length) % FLOOR_PALETTE.length;
  return FLOOR_PALETTE[idx]!;
}

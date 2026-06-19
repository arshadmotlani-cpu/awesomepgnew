/** Deterministic room node visuals — no images required. */

export type RoomVisualSeed = {
  seed: number;
  gradient: string;
  glowColor: string;
  glowIntensity: number;
  noiseOpacity: number;
  patternScale: number;
  accentHue: number;
};

const GRADIENTS = [
  ['#1a1033', '#0d2847', '#081018'],
  ['#2a1520', '#1a2840', '#0a0e18'],
  ['#152a28', '#1a2048', '#080c14'],
  ['#281a10', '#102838', '#0a1018'],
  ['#1a1028', '#283818', '#080e16'],
  ['#102028', '#381828', '#0a0c12'],
  ['#181828', '#182838', '#060810'],
] as const;

const GLOW_COLORS = [
  'rgba(255, 90, 31, 0.35)',
  'rgba(34, 211, 238, 0.28)',
  'rgba(167, 139, 250, 0.3)',
  'rgba(52, 211, 153, 0.25)',
  'rgba(251, 191, 36, 0.28)',
  'rgba(244, 114, 182, 0.26)',
  'rgba(96, 165, 250, 0.28)',
] as const;

const NOISE_OPACITIES = [0.32, 0.38, 0.42, 0.35, 0.4, 0.36, 0.44] as const;
const PATTERN_SCALES = [48, 56, 40, 52, 44, 60, 36] as const;
const GLOW_INTENSITIES = [0.55, 0.65, 0.5, 0.7, 0.6, 0.58, 0.72] as const;
const ACCENT_HUES = [24, 188, 270, 160, 45, 320, 210] as const;

function hashRoomId(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i += 1) {
    hash = roomId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getRoomVisualSeed(roomId: string): RoomVisualSeed {
  const seed = hashRoomId(roomId) % 7;
  const [c1, c2, c3] = GRADIENTS[seed];
  return {
    seed,
    gradient: `linear-gradient(145deg, ${c1} 0%, ${c2} 52%, ${c3} 100%)`,
    glowColor: GLOW_COLORS[seed],
    glowIntensity: GLOW_INTENSITIES[seed],
    noiseOpacity: NOISE_OPACITIES[seed],
    patternScale: PATTERN_SCALES[seed],
    accentHue: ACCENT_HUES[seed],
  };
}

export type RoomNodeState = 'available' | 'selected' | 'locked';

export function resolveRoomNodeState(args: {
  isSelected: boolean;
  allBooked: boolean;
}): RoomNodeState {
  if (args.isSelected) return 'selected';
  if (args.allBooked) return 'locked';
  return 'available';
}

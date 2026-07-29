import { FYH_FIELD, FYH_F_PATH, FYH_Y_PATH, FYH_VIEWBOX } from '@/src/lib/brand/fyhIconGeometry';
import { FYH_BRAND } from '@/src/lib/brand/fyhBrandTokens';

export type FyhIconStyle = 'filled' | 'light' | 'monochrome';
export type FyhIconSurface = 'dark' | 'light';

type FyhMarkProps = {
  size?: number;
  style?: FyhIconStyle;
  surface?: FyhIconSurface;
  className?: string;
  title?: string;
};

function palette(style: FyhIconStyle, surface: FyhIconSurface) {
  const m = FYH_BRAND.mark;

  if (style === 'monochrome') {
    const letter = surface === 'light' ? '#4C1D95' : '#FFFFFF';
    return { field: 'none', letter };
  }

  if (style === 'light' || surface === 'light') {
    return { field: '#EDE9FE', letter: m.primaryHover };
  }

  return { field: '#5B21B6', letter: m.onMark };
}

/** FY monogram — purple brand mark (UI chrome stays forest/gold). */
export function FyhMark({
  size = 32,
  style = 'filled',
  surface = 'dark',
  className,
  title = 'For Your Hair',
}: FyhMarkProps) {
  const colors = palette(style, surface);
  const { x, y, size: s, r } = FYH_FIELD;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${FYH_VIEWBOX} ${FYH_VIEWBOX}`}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {colors.field !== 'none' ? (
        <rect x={x} y={y} width={s} height={s} rx={r} fill={colors.field} />
      ) : null}
      <path fill={colors.letter} d={FYH_F_PATH} />
      <path fill={colors.letter} d={FYH_Y_PATH} />
    </svg>
  );
}

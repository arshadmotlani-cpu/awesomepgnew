import {
  AWESOME_PG_BODY_PATH,
  AWESOME_PG_DOOR_PATH,
  AWESOME_PG_FIELD,
  AWESOME_PG_ROOF_PATH,
  AWESOME_PG_VIEWBOX,
} from '@/src/lib/brand/awesomePgIconGeometry';
import { AWESOME_PG_BRAND } from '@/src/lib/brand/awesomePgTokens';

export type AwesomePgIconStyle = 'filled' | 'light' | 'monochrome';
export type AwesomePgIconSurface = 'dark' | 'light';

type AwesomePgMarkProps = {
  size?: number;
  style?: AwesomePgIconStyle;
  surface?: AwesomePgIconSurface;
  className?: string;
  title?: string;
};

function palette(style: AwesomePgIconStyle, surface: AwesomePgIconSurface) {
  const c = AWESOME_PG_BRAND.color;
  const l = AWESOME_PG_BRAND.light;

  if (style === 'monochrome') {
    const ink = surface === 'light' ? l.textPrimary : '#FFFFFF';
    return { field: 'none', roof: ink, body: ink, door: surface === 'light' ? l.surface : c.charcoal };
  }

  if (style === 'light' || surface === 'light') {
    return {
      field: l.bg,
      roof: c.primary,
      body: c.primarySoft,
      door: l.surface,
    };
  }

  return {
    field: c.deep,
    roof: c.primary,
    body: c.primarySoft,
    door: c.charcoal,
  };
}

/** House mark — Awesome PG customer brand. */
export function AwesomePgMark({
  size = 32,
  style = 'filled',
  surface = 'dark',
  className,
  title = 'Awesome PG',
}: AwesomePgMarkProps) {
  const colors = palette(style, surface);
  const { x, y, w, h, r } = AWESOME_PG_FIELD;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${AWESOME_PG_VIEWBOX} ${AWESOME_PG_VIEWBOX}`}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {colors.field !== 'none' ? (
        <rect x={x} y={y} width={w} height={h} rx={r} fill={colors.field} />
      ) : null}
      <path d={AWESOME_PG_ROOF_PATH} fill={colors.roof} />
      <path d={AWESOME_PG_BODY_PATH} fill={colors.body} />
      <path d={AWESOME_PG_DOOR_PATH} fill={colors.door} />
    </svg>
  );
}

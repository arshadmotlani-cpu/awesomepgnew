import { amenityLabel, isAmenityComingSoon } from '@/src/lib/pgAmenities';

const PILL_DARK = 'border-white/10 bg-white/5 text-apg-silver';
const PILL_LIGHT = 'border-zinc-200 bg-zinc-50 text-zinc-700';
const PILL_COMING_SOON_DARK = 'border-apg-cyan/30 bg-apg-cyan/10 text-apg-cyan';
const PILL_COMING_SOON_LIGHT = 'border-amber-200 bg-amber-50 text-amber-800';

type AmenityPill = {
  label: string;
  comingSoon: boolean;
};

function collectAmenityPills(amenities: Record<string, unknown>): AmenityPill[] {
  const pills: AmenityPill[] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(amenities)) {
    if (key === 'custom' || value !== true) continue;
    const label = amenityLabel(key);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    pills.push({ label, comingSoon: isAmenityComingSoon(key) });
  }

  const custom = Array.isArray(amenities.custom)
    ? (amenities.custom as string[]).filter(Boolean)
    : [];
  for (const label of custom) {
    if (seen.has(label)) continue;
    seen.add(label);
    pills.push({ label, comingSoon: false });
  }

  return pills;
}

export function AmenityList({
  amenities,
  variant = 'dark',
}: {
  amenities: Record<string, unknown>;
  variant?: 'dark' | 'light';
}) {
  const pills = collectAmenityPills(amenities);
  const basePill = variant === 'light' ? PILL_LIGHT : PILL_DARK;
  const comingSoonPill = variant === 'light' ? PILL_COMING_SOON_LIGHT : PILL_COMING_SOON_DARK;

  if (pills.length === 0) {
    return (
      <span className="text-xs text-apg-silver/60">
        Daily cleaning, WiFi, laundry & more — ask what&apos;s live at this property
      </span>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {pills.map(({ label, comingSoon }) => (
        <li
          key={label}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            comingSoon ? comingSoonPill : basePill
          }`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

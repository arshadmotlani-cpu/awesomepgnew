const AMENITY_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi',
  food: 'Meals',
  laundry: 'Laundry',
  parking: 'Parking',
  ac: 'AC',
  housekeeping: 'Housekeeping',
  powerBackup: 'Power backup',
  gym: 'Gym',
  cctv: 'CCTV',
  geyser: 'Geyser',
  waterPurifier: 'RO water',
  lift: 'Lift',
  gaming: 'Gaming zone',
  arcade: 'Arcade',
  chillRoom: 'Chill room',
  socialLounge: 'Social lounge',
};

const PILL_DARK = 'border-white/10 bg-white/5 text-apg-silver';
const PILL_LIGHT = 'border-zinc-200 bg-zinc-50 text-zinc-700';

export function AmenityList({
  amenities,
  variant = 'dark',
}: {
  amenities: Record<string, unknown>;
  variant?: 'dark' | 'light';
}) {
  const custom = Array.isArray(amenities.custom)
    ? (amenities.custom as string[]).filter(Boolean)
    : [];

  const active = Object.entries(amenities)
    .filter(([k, v]) => k !== 'custom' && v === true)
    .map(([k]) => AMENITY_LABELS[k] ?? k);

  const all = [...active, ...custom];
  const pill = variant === 'light' ? PILL_LIGHT : PILL_DARK;

  if (all.length === 0) {
    return (
      <span className="text-xs text-apg-silver/60">
        Premium amenities — ask us what&apos;s live at this property
      </span>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {all.map((label) => (
        <li
          key={label}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pill}`}
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

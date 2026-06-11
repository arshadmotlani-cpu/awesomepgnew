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
};

export function AmenityList({ amenities }: { amenities: Record<string, unknown> }) {
  const custom = Array.isArray(amenities.custom)
    ? (amenities.custom as string[]).filter(Boolean)
    : [];

  const active = Object.entries(amenities)
    .filter(([k, v]) => k !== 'custom' && v === true)
    .map(([k]) => AMENITY_LABELS[k] ?? k);

  const all = [...active, ...custom];

  if (all.length === 0) {
    return <span className="text-xs text-apg-silver/60">No amenities listed</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {all.map((label) => (
        <li
          key={label}
          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-apg-silver"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

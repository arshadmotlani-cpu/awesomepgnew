const AMENITY_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi',
  food: 'Meals',
  laundry: 'Laundry',
  parking: 'Parking',
  ac: 'AC',
  housekeeping: 'Housekeeping',
  powerBackup: 'Power backup',
};

export function AmenityList({ amenities }: { amenities: Record<string, unknown> }) {
  const active = Object.entries(amenities)
    .filter(([, v]) => v === true)
    .map(([k]) => AMENITY_LABELS[k] ?? k);
  if (active.length === 0) {
    return <span className="text-xs text-apg-silver/60">No amenities listed</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {active.map((label) => (
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

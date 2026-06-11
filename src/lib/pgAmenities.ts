export type AmenityDefinition = {
  key: string;
  /** Public pill label on PG cards and detail pages */
  label: string;
  /** Admin checkbox label; falls back to `label` */
  adminLabel?: string;
  /** Appends a coming-soon badge on marketing cards and amenity pills */
  comingSoon?: boolean;
  /** Legacy keys — ignored on public listings even when true in DB */
  deprecated?: boolean;
};

export const PG_AMENITY_DEFINITIONS: AmenityDefinition[] = [
  { key: 'wifi', label: 'High-speed WiFi' },
  { key: 'roomCleaning', label: 'Daily room cleaning' },
  { key: 'bathroomCleaning', label: 'Daily bathroom cleaning' },
  { key: 'bedTidy', label: 'Beds kept neat & tidy' },
  { key: 'bedSheetsWeekly', label: 'Bedsheets changed weekly' },
  {
    key: 'laundry',
    label: 'Free laundry',
    adminLabel: 'Free laundry (bring liquid detergent & laundry bag)',
  },
  { key: 'chairsInRooms', label: 'Chairs in every room' },
  {
    key: 'freeElectricity',
    label: 'Electricity included',
    adminLabel: 'Electricity included (AC usage split per tenant)',
  },
  { key: 'waterCooler', label: 'Water cooler (chilled water)' },
  { key: 'fridge', label: 'Fridge for food & drinks' },
  { key: 'airCoolerChillRoom', label: 'Air cooler in chill room' },
  { key: 'ac', label: 'AC rooms', adminLabel: 'AC rooms (usage split per tenant)' },
  { key: 'cctv', label: 'CCTV security' },
  { key: 'geyser', label: 'Geyser / hot water' },
  { key: 'waterPurifier', label: 'RO water' },
  { key: 'lift', label: 'Lift / elevator' },
  { key: 'parking', label: 'Parking' },
  { key: 'gaming', label: 'Gaming zone' },
  { key: 'arcade', label: 'Arcade' },
  { key: 'chillRoom', label: 'Chill room' },
  { key: 'socialLounge', label: 'Social lounge' },
  {
    key: 'vehicleResale',
    label: '2 & 4 wheeler resale',
    adminLabel: '2 & 4 wheeler resale (contact support)',
  },
  { key: 'gym', label: 'Gym & wellness', comingSoon: true },
  { key: 'farmhouse', label: 'Farmhouse retreats', comingSoon: true },
  // Legacy — do not advertise
  { key: 'food', label: 'Meals', deprecated: true },
  { key: 'powerBackup', label: 'Power backup', deprecated: true },
  { key: 'housekeeping', label: 'Daily room & bathroom cleaning' },
];

const byKey = new Map(PG_AMENITY_DEFINITIONS.map((d) => [d.key, d]));

export const PG_AMENITY_KEYS = PG_AMENITY_DEFINITIONS.filter((d) => !d.deprecated).map(
  (d) => d.key,
);

export function amenityLabel(key: string): string | null {
  const def = byKey.get(key);
  if (!def || def.deprecated) return null;
  return def.comingSoon ? `${def.label} (coming soon)` : def.label;
}

export function amenityAdminLabel(key: string): string {
  const def = byKey.get(key);
  if (!def) return key;
  const base = def.adminLabel ?? def.label;
  return def.comingSoon ? `${base} (coming soon)` : base;
}

export function isAmenityComingSoon(key: string): boolean {
  return byKey.get(key)?.comingSoon === true;
}

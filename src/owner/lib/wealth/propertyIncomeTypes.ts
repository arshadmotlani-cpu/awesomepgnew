export type PropertyIncomeSourceType =
  | 'PG'
  | 'SHOP'
  | 'OFFICE'
  | 'RESIDENTIAL_RENT'
  | 'COMMERCIAL_RENT'
  | 'PARKING'
  | 'OTHER';

export type PropertyIncomeSourceStatus = 'ACTIVE' | 'VACANT' | 'INACTIVE';

export const PROPERTY_INCOME_SOURCE_TYPES: Array<{
  value: PropertyIncomeSourceType;
  label: string;
}> = [
  { value: 'PG', label: 'PG' },
  { value: 'SHOP', label: 'Shop' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'RESIDENTIAL_RENT', label: 'Residential rent' },
  { value: 'COMMERCIAL_RENT', label: 'Commercial rent' },
  { value: 'PARKING', label: 'Parking' },
  { value: 'OTHER', label: 'Other' },
];

export function isActiveIncomeStatus(status: string): boolean {
  return status === 'ACTIVE';
}

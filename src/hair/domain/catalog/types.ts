export type BillableItemType = 'service' | 'product' | 'package' | 'membership';

export type StaffMode = 'SERVICE' | 'SALE';

export type BillableItem = {
  id: string;
  type: BillableItemType;
  name: string;
  code: string | null;
  sellingPricePaise: number;
  gstBps: number;
  category: string | null;
  staffMode: StaffMode;
  active: boolean;
};

export function staffModeForType(type: BillableItemType): StaffMode {
  return type === 'service' ? 'SERVICE' : 'SALE';
}

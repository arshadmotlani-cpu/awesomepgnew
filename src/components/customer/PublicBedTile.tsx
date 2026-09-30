'use client';

import { BedShareButton } from '@/src/components/customer/BedShareButton';
import { CustomerBedTile } from '@/src/components/customer/customerBedUi';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';

type Props = {
  bed: BedSelectorBed;
  isSelected?: boolean;
  onSelect: () => void;
  pgSlug: string;
  roomId: string;
  roomLabel: string;
  highlighted?: boolean;
};

/** Bed tile plus a sibling share control. The tile stays a single button. */
export function PublicBedTile({
  bed,
  isSelected,
  onSelect,
  pgSlug,
  roomId,
  roomLabel,
  highlighted = false,
}: Props) {
  return (
    <div
      className={`relative min-w-0 ${
        highlighted ? 'z-[1] rounded-xl ring-2 ring-apg-orange/80 ring-offset-2 ring-offset-transparent' : ''
      }`}
      data-bed-id={bed.bedId}
      data-shared-bed={highlighted ? 'true' : undefined}
    >
      <CustomerBedTile bed={bed} isSelected={isSelected} onSelect={onSelect} />
      <BedShareButton
        className="absolute right-1 top-1 z-10"
        pgSlug={pgSlug}
        roomId={roomId}
        bedId={bed.bedId}
        bedCode={bed.bedCode}
        roomLabel={roomLabel}
      />
    </div>
  );
}

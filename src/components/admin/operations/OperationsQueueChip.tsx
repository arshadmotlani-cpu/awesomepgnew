import Link from 'next/link';
import {
  operationsQueueChipClass,
  operationsQueueChipLabelClass,
  operationsQueueCountBadgeClass,
  operationsQueueChipNeedsAttention,
} from '@/src/lib/operations/operationsQueueChipStyles';
import { operationsFilterHref, type OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';

type OperationsQueueChipProps = {
  id: OpsQueueFilter;
  label: string;
  count: number;
  selected: boolean;
};

export function OperationsQueueChip({ id, label, count, selected }: OperationsQueueChipProps) {
  const needsAttention = operationsQueueChipNeedsAttention(count);

  return (
    <Link
      href={operationsFilterHref(id)}
      className={operationsQueueChipClass(count, selected)}
      aria-current={selected ? 'page' : undefined}
      aria-label={
        needsAttention
          ? `${label}: ${count} item${count === 1 ? '' : 's'} need action`
          : `${label}: no items need action`
      }
    >
      <span className={operationsQueueChipLabelClass(count, selected)}>{label}</span>
      <span className={operationsQueueCountBadgeClass(count, selected)}>{count}</span>
    </Link>
  );
}

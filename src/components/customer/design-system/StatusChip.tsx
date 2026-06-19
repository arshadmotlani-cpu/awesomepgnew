import { requestStatusTone } from '@/src/lib/design-system/tokens';
import { titleCase } from '@/src/lib/format';

type Props = {
  status: string;
  toneMap?: Record<string, string>;
  icon?: React.ReactNode;
};

export function StatusChip({ status, toneMap = requestStatusTone, icon }: Props) {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  const tone = toneMap[key] ?? toneMap[status] ?? 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {icon}
      {titleCase(status.replace(/_/g, ' '))}
    </span>
  );
}

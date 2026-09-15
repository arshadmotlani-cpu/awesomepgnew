import { FyhMark } from '@/src/components/brand/fyh/FyhMark';

export function FyhSidebarBrand({ className }: { className?: string }) {
  return (
    <div
      className={['flex h-11 min-w-0 items-center overflow-hidden border-b border-[color:var(--fyh-border)] px-2', className]
        .filter(Boolean)
        .join(' ')}
    >
      <FyhMark size={32} className="min-w-0 max-w-full shrink-0" title="SOFT" />
    </div>
  );
}

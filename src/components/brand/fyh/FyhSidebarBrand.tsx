import { FyhMark } from '@/src/components/brand/fyh/FyhMark';

export function FyhSidebarBrand({ className }: { className?: string }) {
  return (
    <div
      className={['flex h-11 items-center border-b border-[color:var(--fyh-border)] px-2.5', className]
        .filter(Boolean)
        .join(' ')}
    >
      <FyhMark size={30} className="shrink-0" title="Salon Software" />
    </div>
  );
}

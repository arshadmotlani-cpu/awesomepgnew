import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

export function FyhSidebarBrand({ className }: { className?: string }) {
  return (
    <div className={['flex h-14 items-center gap-2.5 border-b border-[color:var(--fyh-border)] px-3', className].filter(Boolean).join(' ')}>
      <FyhMark size={36} className="shrink-0 shadow-lg shadow-black/30" />
      <div className="min-w-0">
        <p className="fyh-display truncate text-sm font-semibold tracking-tight">{FYH_ERP.shortName}</p>
        <p className="text-[9px] uppercase tracking-[0.16em] text-fyh-text-muted">{FYH_ERP.productLine}</p>
      </div>
    </div>
  );
}

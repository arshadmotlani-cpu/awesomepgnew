import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

export function FyhSidebarBrand({ className }: { className?: string }) {
  return (
    <div className={['flex h-16 items-center gap-3 border-b border-[color:var(--fyh-border)] px-4', className].filter(Boolean).join(' ')}>
      <FyhMark size={40} className="shrink-0 shadow-lg shadow-black/30" />
      <div className="min-w-0">
        <p className="fyh-display truncate text-base font-semibold tracking-tight">{FYH_ERP.shortName}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-fyh-text-muted">{FYH_ERP.productLine}</p>
      </div>
    </div>
  );
}

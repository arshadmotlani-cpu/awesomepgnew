import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';
import { CAPITAL_OS, CAPITAL_OS_BRAND } from '@/src/lib/brand/capitalOsTokens';

type CapitalOsLogoLockupProps = {
  compact?: boolean;
  className?: string;
  markSize?: number;
};

/** Dual lockup: Capital OS + Automotive Capital subtitle. */
export function CapitalOsLogoLockup({
  compact = false,
  className,
  markSize = 32,
}: CapitalOsLogoLockupProps) {
  return (
    <div className={['flex min-w-0 items-center gap-3', className].filter(Boolean).join(' ')}>
      <CapitalOsMark size={markSize} className="shrink-0 rounded-lg shadow-lg shadow-black/30" />
      <div className="min-w-0">
        <p
          className="truncate text-sm font-semibold tracking-tight"
          style={{ color: CAPITAL_OS_BRAND.color.textPrimary }}
        >
          {CAPITAL_OS.name}
        </p>
        {!compact ? (
          <p
            className="truncate text-[10px] uppercase tracking-[0.18em]"
            style={{ color: CAPITAL_OS_BRAND.color.textMuted }}
          >
            {CAPITAL_OS.legalName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

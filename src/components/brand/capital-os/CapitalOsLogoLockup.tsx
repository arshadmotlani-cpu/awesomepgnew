import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';

type CapitalOsLogoLockupProps = {
  compact?: boolean;
  className?: string;
  markSize?: number;
};

/** Admin branding surface — AUTO mark only. */
export function CapitalOsLogoLockup({
  className,
  markSize = 32,
}: CapitalOsLogoLockupProps) {
  return (
    <div className={['flex min-w-0 items-center', className].filter(Boolean).join(' ')}>
      <CapitalOsMark size={markSize} className="shrink-0" title="Automotive Capital" />
    </div>
  );
}

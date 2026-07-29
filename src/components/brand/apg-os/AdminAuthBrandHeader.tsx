import { ApgOsLogoLockup } from '@/src/components/brand/apg-os/ApgOsLogoLockup';

/** Shared header for admin auth screens (login, password flows). */
export function AdminAuthBrandHeader({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <ApgOsLogoLockup
      layout="stacked"
      markSize={48}
      variant="on-light"
      showTagline={showTagline}
      className="mb-4 sm:items-start sm:text-left"
    />
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/src/hair/lib/utils';

export const SETTINGS_SECTIONS = [
  { href: '/settings/salon', label: 'Salon' },
  { href: '/settings/gst-invoice', label: 'GST / Invoice' },
  { href: '/settings/printer', label: 'Printer' },
  { href: '/settings/whatsapp', label: 'WhatsApp' },
  { href: '/settings/communication', label: 'Communication' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/inventory', label: 'Inventory' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/historical-import', label: 'Historical import', superAdminOnly: true },
  { href: '/settings/permissions', label: 'Permissions', superAdminOnly: true },
] as const;

export function SettingsNav({ showPermissions = false }: { showPermissions?: boolean }) {
  const pathname = usePathname();
  const sections = SETTINGS_SECTIONS.filter(
    (section) => !('superAdminOnly' in section && section.superAdminOnly) || showPermissions,
  );

  return (
    <div className="flex flex-wrap gap-1 border-b border-[color:var(--fyh-border)] pb-2">
      {sections.map((section) => {
        const active =
          pathname === section.href ||
          (section.href === '/settings/salon' && pathname === '/settings');
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-[color:var(--fyh-nav-active-bg)] font-semibold text-fyh-text shadow-[inset_2px_0_0_var(--fyh-accent)]'
                : 'text-fyh-text-secondary hover:bg-white/6 hover:text-fyh-text',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="fyh-section-eyebrow">{eyebrow}</p>
      <h2 className="fyh-display mt-2 text-2xl font-semibold text-fyh-text">{title}</h2>
      <p className="mt-2 text-base text-fyh-text-secondary">{description}</p>
    </div>
  );
}

export function SettingsSaveFeedback({ state }: { state: { error?: string; success?: string } }) {
  return (
    <>
      {state.error ? <p className="text-sm text-fyh-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-fyh-success">{state.success}</p> : null}
    </>
  );
}

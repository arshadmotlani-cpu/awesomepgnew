import Link from 'next/link';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { href: '/admin/settings/business', label: 'Business', desc: 'PG listings and operational config' },
  { href: '/admin/settings/policies', label: 'Policies', desc: 'Notice periods, deposits, house rules' },
  { href: '/admin/settings/payments', label: 'Payments', desc: 'UPI, QR, Razorpay links' },
  { href: '/admin/settings/notifications', label: 'Notifications', desc: 'Bell, WhatsApp, email preferences' },
  { href: '/admin/system/health-report', label: 'System health', desc: 'Deploy gate and diagnostics' },
  { href: '/admin/system/production-audit', label: 'Production audit', desc: 'Unified verification hub' },
] as const;

export default async function SettingsHubPage() {
  const session = await requireAdminSession('/admin/settings');
  const isDeveloper = session.role === 'super_admin';

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business configuration — repair tools are in Developer Mode only."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/35"
          >
            <h2 className="text-sm font-semibold text-white">{s.label}</h2>
            <p className="mt-1 text-xs text-apg-silver">{s.desc}</p>
          </Link>
        ))}
        {isDeveloper ? (
          <Link
            href="/admin/system/developer"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 transition hover:border-rose-400/50"
          >
            <h2 className="text-sm font-semibold text-rose-100">Developer Mode</h2>
            <p className="mt-1 text-xs text-rose-200/80">Repairs, recalc, and diagnostic tools</p>
          </Link>
        ) : null}
      </div>
    </>
  );
}

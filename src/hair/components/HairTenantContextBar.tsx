import Link from 'next/link';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';

export async function HairTenantContextBar() {
  if (!isFyhSaasTenantEnabled()) return null;
  const ctx = await getTenantContextForPage();
  if (!ctx) return null;

  return (
    <div className="border-b border-[color:var(--fyh-border-strong)] bg-fyh-forest/10 px-3 py-2 text-xs text-fyh-text-secondary sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          Organization context active ·{' '}
          <span className="font-medium text-fyh-text">{ctx.organizationId.slice(0, 8)}…</span>
        </p>
        <Link href="/select-organization" className="text-fyh-accent hover:underline">
          Switch organization
        </Link>
      </div>
    </div>
  );
}

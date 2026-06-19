import Link from 'next/link';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';

export function VacatingPrimaryActions({
  pendingCount,
  approvedCount,
}: {
  pendingCount: number;
  approvedCount: number;
}) {
  const actions: Array<{ key: string; href: string; label: string; primary?: boolean }> = [];

  if (pendingCount > 0) {
    actions.push({
      key: 'pending',
      href: '/admin/vacating?status=pending',
      label: `Review ${pendingCount} waiting request${pendingCount === 1 ? '' : 's'}`,
      primary: true,
    });
  }

  if (approvedCount > 0) {
    actions.push({
      key: 'settlements',
      href: '/admin/checkout-settlements?tab=awaiting_resident',
      label: `Open ${approvedCount} checkout${approvedCount === 1 ? '' : 's'}`,
      primary: pendingCount === 0,
    });
  }

  actions.push({
    key: 'all-settlements',
    href: '/admin/checkout-settlements',
    label: 'All checkout settlements',
  });

  actions.push({
    key: 'all',
    href: '/admin/vacating',
    label: 'All move-out requests',
  });

  const visible = actions.slice(0, 5);

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {pendingCount > 0
          ? 'Approve move-out requests first — then complete deposit refund in Checkout settlements.'
          : approvedCount > 0
            ? 'Approved move-outs need checkout — open each settlement to finish the refund.'
            : 'No urgent move-outs right now. Residents submit notice from their account.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {visible.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            className={action.primary ? PRIMARY : SECONDARY}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

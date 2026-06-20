'use client';

const MODULES = [
  { id: 'profile', label: 'Profile' },
  { id: 'journey', label: 'Journey' },
  { id: 'billing', label: 'Billing' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'documents', label: 'Documents' },
] as const;

export function AccountModuleNav({ showBilling }: { showBilling: boolean }) {
  const items = showBilling ? MODULES : MODULES.filter((m) => !['billing', 'invoices', 'deposit'].includes(m.id));

  return (
    <nav
      className="sticky top-14 z-30 -mx-1 overflow-x-auto border-b border-white/10 bg-[#0a0f18]/90 px-1 py-2 backdrop-blur-md"
      aria-label="Account sections"
    >
      <ul className="flex min-w-min gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold text-apg-silver transition hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Scroll to hash on load for legacy ?section= deep links. */
export function AccountSectionScrollSync({
  targetId,
}: {
  targetId: string | null;
}) {
  if (!targetId) return null;

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `requestAnimationFrame(function(){var el=document.getElementById(${JSON.stringify(targetId)});if(el)el.scrollIntoView({behavior:'smooth',block:'start'});});`,
      }}
    />
  );
}

import Link from 'next/link';

const TABS = [
  { href: '', label: 'Overview', suffix: '' },
  { href: '/locations', label: 'Locations', suffix: '/locations' },
  { href: '/members', label: 'Members', suffix: '/members' },
] as const;

type Props = {
  organizationId: string;
  organizationName: string;
  activeTab: 'overview' | 'locations' | 'members';
};

export function OrgTabNav({ organizationId, organizationName, activeTab }: Props) {
  const base = `/platform/admin/organizations/${organizationId}`;

  return (
    <div className="mb-6 border-b border-[var(--plt-border)]">
      <p className="text-xs text-[var(--plt-text-subtle)] mb-2">{organizationName}</p>
      <nav className="flex gap-1 -mb-px">
        {TABS.map((tab) => {
          const href = tab.suffix ? `${base}${tab.suffix}` : base;
          const isActive =
            tab.suffix === ''
              ? activeTab === 'overview'
              : tab.suffix === '/locations'
                ? activeTab === 'locations'
                : activeTab === 'members';
          return (
            <Link
              key={tab.label}
              href={href}
              className={[
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-[var(--plt-accent)] text-[var(--plt-accent)]'
                  : 'border-transparent text-[var(--plt-text-muted)] hover:text-[var(--plt-text)]',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

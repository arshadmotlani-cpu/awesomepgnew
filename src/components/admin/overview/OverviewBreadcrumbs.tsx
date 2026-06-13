import Link from 'next/link';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function OverviewBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Overview navigation" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-2">
          {i > 0 ? <span className="text-apg-silver/40">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="text-apg-silver transition hover:text-[#FF5A1F]">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-white">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

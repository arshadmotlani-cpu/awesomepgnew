import Link from 'next/link';
import type { BedRoomRecommendation } from '@/src/lib/beds/bedAssignmentCommand';

export function BedSmartRecommendations({ items }: { items: BedRoomRecommendation[] }) {
  if (items.length === 0) return null;

  const byKind = [
    { kind: 'fill_next' as const, label: 'Best room to fill next' },
    { kind: 'nearly_full' as const, label: 'Nearly full rooms' },
    { kind: 'empty' as const, label: 'Empty rooms' },
    { kind: 'upcoming_vacancy' as const, label: 'Upcoming vacancies' },
  ];

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-white">Smart bed recommendations</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Fill nearly-full rooms first — no need to inspect every room manually.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {byKind.map(({ kind, label }) => {
          const rows = items.filter((i) => i.kind === kind).slice(0, 3);
          if (rows.length === 0) return null;
          return (
            <div key={kind} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">{label}</h3>
              <ul className="mt-3 space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{r.headline}</p>
                      <p className="text-xs text-apg-silver">
                        {r.pgName} · {r.detail}
                      </p>
                    </div>
                    {r.bedId ? (
                      <Link
                        href={`/admin/beds?pgId=${r.pgId}&bedId=${r.bedId}`}
                        className="shrink-0 text-xs font-semibold text-[#FF5A1F] hover:underline"
                      >
                        Assign →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

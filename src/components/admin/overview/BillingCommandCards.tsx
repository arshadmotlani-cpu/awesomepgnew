import Link from 'next/link';
import type { BillingCommandCard } from '@/src/services/billingCommandCenter';

function toneClasses(tone: BillingCommandCard['tone']) {
  if (tone === 'urgent') return 'border-rose-500/40 hover:border-rose-400/60';
  if (tone === 'warn') return 'border-amber-500/40 hover:border-amber-400/60';
  return 'border-white/10 hover:border-[#FF5A1F]/40';
}

export function BillingCommandCards({ cards }: { cards: BillingCommandCard[] }) {
  if (cards.length === 0) return null;

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Billing command centre</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Pending invoices, payment reviews, and collections — tap a card to open the filtered list.
          </p>
        </div>
        <Link href="/admin/billing" className="text-sm font-medium text-[#FF5A1F] hover:underline">
          Billing Centre →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className={`block rounded-2xl border bg-[#1A1F27] p-5 transition ${toneClasses(card.tone)}`}
          >
            <p className="text-sm text-apg-silver">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">{card.count}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

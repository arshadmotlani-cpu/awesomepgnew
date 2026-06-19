import { ApgCard } from '@/src/components/customer/design-system';
import type { NearbyPlace, PgReview } from '@/src/lib/marketing/pgTrustContent';

type Props = {
  reviews: PgReview[];
  nearby: NearbyPlace[];
};

export function PgTrustSection({ reviews, nearby }: Props) {
  return (
    <section className="mt-12 grid gap-8 lg:grid-cols-2">
      <div>
        <h2 className="text-xl font-semibold text-white">Resident reviews</h2>
        <p className="mt-1 text-sm text-apg-silver">Real feedback from verified residents.</p>
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li key={r.quote.slice(0, 24)}>
              <ApgCard tier="card" className="p-4">
                <p className="text-sm leading-relaxed text-apg-silver">&ldquo;{r.quote}&rdquo;</p>
                <p className="mt-2 text-xs font-semibold text-white">
                  {r.author} · {r.tenure}
                </p>
              </ApgCard>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">Nearby</h2>
        <p className="mt-1 text-sm text-apg-silver">Walkable essentials around the property.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {nearby.map((place) => (
            <li
              key={place.name}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-apg-silver"
            >
              <span className="font-semibold text-white">{place.name}</span>
              {' · '}
              {place.distance} · {place.category}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

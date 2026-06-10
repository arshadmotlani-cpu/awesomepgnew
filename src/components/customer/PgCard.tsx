import Link from 'next/link';
import { defaultBrowseStayQuery } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
import { AmenityList } from './AmenityList';
import { GenderBadge } from './GenderBadge';

export type PgCardData = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  amenities: Record<string, unknown>;
  description: string | null;
  heroImage: string | null;
  totalBeds: number;
  availableBeds: number;
  startingFromPaise: number;
};

export function PgCard({ pg }: { pg: PgCardData }) {
  return (
    <Link
      href={`/pgs/${pg.slug}?${defaultBrowseStayQuery()}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-indigo-100 via-zinc-100 to-emerald-100">
        {pg.heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pg.heroImage}
            alt={`${pg.name} hero`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {pg.name}
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <GenderBadge policy={pg.genderPolicy} />
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
          {pg.availableBeds} of {pg.totalBeds} beds free today
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 group-hover:text-indigo-700">
            {pg.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {pg.city}, {pg.state} · {pg.pincode}
          </p>
        </div>

        {pg.description ? (
          <p className="line-clamp-2 text-sm text-zinc-600">{pg.description}</p>
        ) : null}

        <AmenityList amenities={pg.amenities} />

        <div className="mt-auto flex items-end justify-between border-t border-zinc-100 pt-3">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              From
            </span>
            <p className="text-lg font-semibold text-zinc-900">
              {pg.startingFromPaise > 0 ? paiseToInr(pg.startingFromPaise) : '—'}
              <span className="ml-1 text-xs font-normal text-zinc-500">/mo</span>
            </p>
          </div>
          <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5">
            View beds →
          </span>
        </div>
      </div>
    </Link>
  );
}

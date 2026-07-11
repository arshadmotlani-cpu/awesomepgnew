'use client';

import Link from 'next/link';
import { LiveAvailabilityStrip } from '@/src/components/customer/marketing/LiveAvailabilityStrip';
import { ApgCard } from '@/src/components/customer/design-system';
import { PgCard, type PgCardData } from '@/src/components/customer/PgCard';
import { AwesomePgLogo } from '@/src/components/brand/AwesomePgLogo';
import { paiseToInr } from '@/src/lib/format';

type LifestyleItem = {
  emoji: string;
  title: string;
  body: string;
  comingSoon?: boolean;
};

const FEATURES = [
  { label: 'Stay cool 24/7', sub: 'AC rooms · split billing only for usage' },
  { label: 'Unlimited high-speed WiFi', sub: 'Work, stream, game — no caps' },
  { label: 'Daily cleaning & laundry', sub: 'Fresh sheets weekly · free laundry' },
  { label: 'Transparent bills', sub: 'Rent · AC power · deposit — no surprises' },
];

const LIFESTYLE: LifestyleItem[] = [
  {
    emoji: '🎮',
    title: 'Gaming zones',
    body: 'Console lounges and late-night tournaments — play without leaving home.',
  },
  {
    emoji: '🕹️',
    title: 'Arcade & chill rooms',
    body: 'Dedicated spaces to unwind, stream, and hang out with your PG family — air cooler included in the chill room.',
  },
  {
    emoji: '💪',
    title: 'Gym & wellness',
    body: 'Fitness facilities rolling out across properties — strength, cardio, recovery.',
    comingSoon: true,
  },
  {
    emoji: '🏡',
    title: 'Farmhouse retreats',
    body: 'Exclusive getaways for Awesome PG residents — recharge outside the city.',
    comingSoon: true,
  },
  {
    emoji: '🛵',
    title: 'Two & four wheelers',
    body: 'We help residents buy quality second-hand 2-wheelers and 4-wheelers. Contact support to explore options.',
  },
  {
    emoji: '✨',
    title: 'Premium living',
    body:
      'Daily room & bathroom cleaning, beds kept neat with weekly fresh sheets, free laundry (bring liquid detergent & a laundry bag), high-speed WiFi, chairs in every room, chilled water, fridge storage, and electricity included — only AC usage is split per tenant.',
  },
];

const STEPS = [
  { n: '01', title: 'Discover', body: 'Browse PGs, amenities, and live bed availability.' },
  { n: '02', title: 'Pick your bed', body: 'Choose the exact room and bed — not just a vague promise.' },
  { n: '03', title: 'Move in', body: 'Pay securely, complete KYC, and unlock your resident dashboard.' },
  { n: '04', title: 'Live awesome', body: 'Rent, AC electricity, and community — all in one place.' },
];

type Props = {
  availableBeds?: number;
  totalBeds?: number;
  pgCount?: number;
  featuredPgs?: PgCardData[];
};

export function SpatialLandingPage({
  availableBeds = 0,
  totalBeds = 0,
  pgCount = 0,
  featuredPgs = [],
}: Props) {
  return (
    <div className="apg-landing">
      {/* A — Hero: headline + CTAs in first viewport */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 text-center sm:px-6 sm:pb-12 sm:pt-8">
        <div className="flex flex-col items-center gap-3">
          <AwesomePgLogo size={72} priority className="shadow-lg shadow-orange-500/30" />
          <span className="inline-flex items-center gap-2 rounded-full border border-apg-orange/40 bg-apg-orange/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100">
            <span className="h-1.5 w-1.5 rounded-full bg-apg-orange" />
            Awesome PG
          </span>
        </div>
        <h1 className="mx-auto mt-5 max-w-4xl text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:mt-6 sm:text-5xl lg:text-6xl">
          Not just a room.
          <br />
          <span className="apg-gradient-text">A universe you&apos;ll never want to leave.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-apg-silver sm:mt-5 sm:text-lg">
          Premium paying-guest living with gaming zones, chill rooms, daily cleaning, free laundry,
          and honest amenities. Book your exact bed in minutes.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8 sm:gap-4">
          <Link
            href="/pgs"
            className="apg-glow-btn inline-flex min-h-[48px] items-center justify-center rounded-xl bg-apg-orange px-7 py-3 text-sm font-semibold text-white transition hover:brightness-110 sm:px-8"
          >
            Explore PGs & pick your bed
          </Link>
          <Link
            href="/login?next=/account/profile"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-7 py-3 text-sm font-semibold text-white transition hover:border-apg-orange/40 hover:bg-white/15 sm:px-8"
          >
            Resident sign in
          </Link>
        </div>
      </section>

      {/* B — Trust / live availability */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
        <LiveAvailabilityStrip
          availableBeds={availableBeds}
          totalBeds={totalBeds}
          pgCount={pgCount}
        />
      </section>

      {/* D — Feature cards: responsive grid, no overlap */}
      <section
        id="features"
        data-section="features"
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20"
      >
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
            Why residents choose us
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Everything you need, included upfront
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => (
            <ApgCard key={item.label} tier="card" className="h-full px-4 py-5 text-left">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="mt-2 text-xs leading-relaxed text-apg-silver">{item.sub}</p>
            </ApgCard>
          ))}
        </div>
      </section>

      {/* Amenities */}
      <section
        id="amenities"
        data-section="amenities"
        className="border-y border-white/10 bg-white/[0.02] py-16 sm:py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan">
              The Awesome life
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Facilities that make people talk about this place
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-apg-silver sm:text-base">
              Quality living, entertainment, and community aren&apos;t extras — they&apos;re the
              standard. We&apos;re honest about what&apos;s live today versus coming soon.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LIFESTYLE.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl" aria-hidden>
                    {item.emoji}
                  </span>
                  {item.comingSoon ? (
                    <span className="shrink-0 rounded-full border border-apg-cyan/35 bg-apg-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-apg-cyan">
                      Coming soon
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-apg-silver">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Rooms */}
      {featuredPgs.length > 0 ? (
        <section id="rooms" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
                Browse properties
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Pick a PG, then your exact bed
              </h2>
              <p className="mt-2 text-sm text-apg-silver">
                Live availability — no guessing which rooms are actually open.
              </p>
            </div>
            <Link
              href="/pgs"
              className="shrink-0 text-sm font-semibold text-apg-cyan hover:text-apg-orange"
            >
              View all PGs →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featuredPgs.slice(0, 3).map((pg) => (
              <PgCard key={pg.id} pg={pg} />
            ))}
          </div>
          {featuredPgs[0]?.startingFromPaise ? (
            <p className="mt-6 text-center text-xs text-apg-muted">
              From {paiseToInr(featuredPgs[0].startingFromPaise)}/mo at select properties
            </p>
          ) : null}
        </section>
      ) : null}

      {/* How it works */}
      <section className="border-t border-white/10 bg-white/[0.03] py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
            Simple journey
          </p>
          <h2 className="mt-2 text-center text-2xl font-semibold text-white sm:text-3xl">
            From browse to belonging
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <span className="text-2xl font-bold text-apg-orange/60">{step.n}</span>
                <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-apg-silver">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-4xl">
          Ready to live somewhere
          <br />
          <span className="apg-gradient-text">you&apos;ll recommend forever?</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-apg-silver sm:text-base">
          Search PGs, see real availability, and reserve the bed that fits your life — before
          someone else does.
        </p>
        <Link
          href="/pgs"
          className="apg-glow-btn mt-8 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-apg-orange px-10 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Start browsing →
        </Link>
      </section>
    </div>
  );
}

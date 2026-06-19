'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { LiveAvailabilityStrip } from '@/src/components/customer/marketing/LiveAvailabilityStrip';
import { ApgCard } from '@/src/components/customer/design-system';
import { WorldLayer, WorldSection } from '@/src/components/world';
import { WORLD_EASE } from '@/src/components/world/worldMotion';

type LifestyleItem = {
  emoji: string;
  title: string;
  body: string;
  comingSoon?: boolean;
};

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
};

export function SpatialLandingPage({
  availableBeds = 0,
  totalBeds = 0,
  pgCount = 4,
}: Props) {
  const reduced = useReducedMotion();

  return (
    <div className="apg-landing apg-aurora apg-grid-overlay world-entry overflow-hidden">
      {/* Phase C — Hero sky layer */}
      <WorldSection id="hero" checkpoint className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <WorldLayer depth={0} className="absolute inset-0 -z-10 opacity-60">
          <div className="world-hero-glow mx-auto h-64 w-64 rounded-full blur-3xl sm:h-96 sm:w-96" />
        </WorldLayer>

        <WorldLayer depth={2} className="max-w-4xl">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: WORLD_EASE.reveal }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-apg-orange/40 bg-apg-orange/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100">
              <span className="h-1.5 w-1.5 rounded-full bg-apg-orange apg-pulse-live" />
              Awesome PG
            </span>
            <h1 className="mt-8 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Not just a room.
              <br />
              <span className="apg-gradient-text">A universe you&apos;ll never want to leave.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-apg-silver sm:text-lg">
              Premium paying-guest living with gaming zones, chill rooms, daily cleaning, free laundry,
              and honest amenities — not empty promises. Book your exact bed in minutes and step into
              a community built for people who expect more.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/pgs"
                className="apg-glow-btn world-cta inline-flex items-center justify-center rounded-xl bg-apg-orange px-8 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Explore PGs & pick your bed
              </Link>
              <Link
                href="/login?next=/account/profile"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white transition hover:border-apg-orange/40 hover:bg-white/15"
              >
                Resident sign in
              </Link>
            </div>
          </motion.div>
        </WorldLayer>

        <WorldLayer depth={1} float className="mt-12 w-full max-w-4xl">
          <LiveAvailabilityStrip
            availableBeds={availableBeds}
            totalBeds={totalBeds}
            pgCount={pgCount}
          />
        </WorldLayer>

        <WorldLayer depth={1} className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Stay cool 24/7', sub: 'AC rooms · split billing only for usage' },
            { label: 'Unlimited high-speed WiFi', sub: 'Work, stream, game — no caps' },
            { label: 'Daily cleaning & laundry', sub: 'Fresh sheets weekly · free laundry' },
            { label: 'Transparent bills', sub: 'Rent · AC power · deposit — no surprises' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: WORLD_EASE.cinematic }}
            >
              <ApgCard tier="card" className="world-float-card px-4 py-4 text-left">
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="mt-1 text-xs text-apg-silver">{s.sub}</p>
              </ApgCard>
            </motion.div>
          ))}
        </WorldLayer>
      </WorldSection>

      {/* Lifestyle — floating objects */}
      <WorldSection id="lifestyle" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <WorldLayer depth={1} className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan">The Awesome life</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Facilities that make people talk about this place
          </h2>
          <p className="mt-3 text-apg-silver">
            We&apos;re building the PG you wish existed — where quality living, entertainment, and
            community aren&apos;t extras. They&apos;re the standard, and we&apos;re honest about
            what&apos;s live today versus coming soon.
          </p>
        </WorldLayer>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIFESTYLE.map((item, i) => (
            <WorldLayer key={item.title} depth={i % 3 === 0 ? 2 : 1} float={i % 2 === 0}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.04, ease: WORLD_EASE.cinematic }}
                className="group apg-glass apg-shimmer world-float-card overflow-hidden rounded-2xl p-6 transition hover:border-apg-cyan/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl">{item.emoji}</span>
                  {item.comingSoon ? (
                    <span className="shrink-0 rounded-full border border-apg-cyan/35 bg-apg-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-apg-cyan">
                      Coming soon
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white transition-colors group-hover:text-apg-orange">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-apg-silver">{item.body}</p>
              </motion.div>
            </WorldLayer>
          ))}
        </div>
      </WorldSection>

      {/* Journey checkpoints */}
      <WorldSection
        id="journey"
        checkpoint
        className="border-y border-white/10 bg-white/[0.03] py-20 backdrop-blur-sm"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
            Simple journey
          </p>
          <h2 className="mt-2 text-center text-3xl font-semibold text-white sm:text-4xl">
            From browse to belonging
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <WorldLayer key={step.n} depth={(i % 2) as 0 | 1} float>
                <div className="relative apg-glass-light world-float-card rounded-2xl p-6">
                  <span className="text-3xl font-bold text-apg-orange/50">{step.n}</span>
                  <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-apg-silver">{step.body}</p>
                </div>
              </WorldLayer>
            ))}
          </div>
        </div>
      </WorldSection>

      {/* CTA convergence */}
      <WorldSection id="cta" className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
        <WorldLayer depth={2}>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Ready to live somewhere
            <br />
            <span className="apg-gradient-text">you&apos;ll recommend forever?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-apg-silver">
            Search PGs, see real availability, and reserve the bed that fits your life — before
            someone else does.
          </p>
          <Link
            href="/pgs"
            className="apg-glow-btn world-cta mt-10 inline-flex rounded-xl bg-apg-orange px-10 py-4 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Start browsing →
          </Link>
        </WorldLayer>
      </WorldSection>
    </div>
  );
}

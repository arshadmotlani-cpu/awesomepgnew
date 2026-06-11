'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const LIFESTYLE = [
  {
    emoji: '🎮',
    title: 'Gaming zones',
    body: 'Console lounges, PC rigs, and late-night tournaments — play without leaving home.',
  },
  {
    emoji: '🕹️',
    title: 'Arcade & chill rooms',
    body: 'Dedicated spaces to unwind, stream, and hang out with your PG family.',
  },
  {
    emoji: '💪',
    title: 'Gym & wellness',
    body: 'Fitness facilities rolling out across properties — strength, cardio, recovery.',
  },
  {
    emoji: '🏡',
    title: 'Farmhouse retreats',
    body: 'Exclusive getaways for Awesome PG residents — recharge outside the city.',
  },
  {
    emoji: '🛵',
    title: 'Two & four wheelers',
    body: 'In-house mobility solutions so you move on your terms from day one.',
  },
  {
    emoji: '✨',
    title: 'Premium living',
    body: 'Housekeeping, meals, power backup, CCTV — everything dialed for comfort.',
  },
];

const STEPS = [
  { n: '01', title: 'Discover', body: 'Browse PGs, amenities, and live bed availability.' },
  { n: '02', title: 'Pick your bed', body: 'Choose the exact room and bed — not just a vague promise.' },
  { n: '03', title: 'Move in', body: 'Pay securely, complete KYC, and unlock your resident dashboard.' },
  { n: '04', title: 'Live awesome', body: 'Rent, electricity, and community — all in one place.' },
];

export function LandingPage() {
  return (
    <div className="apg-aurora apg-grid-overlay overflow-hidden">
      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-apg-orange/30 bg-apg-orange/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
            <span className="h-1.5 w-1.5 rounded-full bg-apg-orange apg-float" />
            Awesome PG
          </span>
          <h1 className="mt-8 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            Not just a room.
            <br />
            <span className="apg-gradient-text">A universe you&apos;ll never want to leave.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-apg-silver sm:text-lg">
            Premium paying-guest living with gaming zones, chill rooms, social spaces, and amenities
            that feel like a resort — not a compromise. Book your exact bed in minutes and step into
            a community built for people who expect more.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/pgs"
              className="inline-flex items-center justify-center rounded-xl bg-apg-orange px-8 py-3.5 text-sm font-semibold text-white apg-glow-btn transition hover:brightness-110"
            >
              Explore PGs & pick your bed
            </Link>
            <Link
              href="/login?next=/account/resident"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:border-apg-orange/40 hover:bg-white/8"
            >
              Resident sign in
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-16 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {[
            { label: 'Bed-first booking', sub: 'Your exact bed, locked' },
            { label: 'Social living', sub: 'Game · chill · connect' },
            { label: 'Resident perks', sub: 'Farmhouse · mobility' },
            { label: 'Transparent bills', sub: 'Rent · power · deposit' },
          ].map((s) => (
            <div key={s.label} className="apg-glass rounded-2xl px-4 py-4 text-left">
              <p className="text-sm font-semibold text-white">{s.label}</p>
              <p className="mt-1 text-xs text-apg-silver">{s.sub}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Lifestyle */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-apg-cyan">
            The Awesome life
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Facilities that make people talk about this place
          </h2>
          <p className="mt-3 text-apg-silver">
            We&apos;re building the PG you wish existed — where quality living, entertainment, and
            community aren&apos;t extras. They&apos;re the standard.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIFESTYLE.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.05 }}
              className="group apg-glass apg-shimmer overflow-hidden rounded-2xl p-6 transition hover:border-apg-cyan/30"
            >
              <span className="text-3xl">{item.emoji}</span>
              <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-apg-orange transition-colors">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-apg-silver">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-white/5 bg-apg-deep/50 py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-apg-orange">
            Simple journey
          </p>
          <h2 className="mt-2 text-center text-3xl font-semibold text-white sm:text-4xl">
            From browse to belonging
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="relative apg-glass-light rounded-2xl p-6">
                <span className="text-3xl font-bold text-apg-orange/40">{step.n}</span>
                <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-apg-silver">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
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
          className="mt-10 inline-flex rounded-xl bg-apg-orange px-10 py-4 text-sm font-semibold text-white apg-glow-btn transition hover:brightness-110"
        >
          Start browsing →
        </Link>
      </section>
    </div>
  );
}

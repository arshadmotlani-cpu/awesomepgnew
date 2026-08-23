import type { CSSProperties } from 'react';
import { SalonSoftwareWaitlistForm } from '@/src/hair/components/marketing/SalonSoftwareWaitlistForm';
import { Fraunces, IBM_Plex_Mono, Inter } from 'next/font/google';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--ss-display',
  weight: ['500', '600', '700'],
});

const body = Inter({
  subsets: ['latin'],
  variable: '--ss-body',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--ss-mono',
  weight: ['400', '500'],
});

const MENU = [
  {
    title: 'Bill a walk-in in under 30 seconds',
    body: 'Search, add services or products, split payment across cash/UPI/card, done.',
  },
  {
    title: 'Take a deposit without breaking your books',
    body: 'Wallet credit that reconciles cleanly at checkout.',
  },
  {
    title: "Every stylist's day, mapped out",
    body: 'Bookings by category, staff assigned at billing, not buried in scheduling.',
  },
  {
    title: 'GST done right, every time',
    body: 'Applied automatically — no manual math, no year-end scramble.',
  },
  {
    title: 'Know exactly who earned what',
    body: 'Every sale tied to the stylist who made it, feeding real performance numbers.',
  },
  {
    title: 'Stock that tracks itself',
    body: 'Vendors, purchases, and expenses live in one place.',
  },
] as const;

const RECEIPT_LINES = [
  { label: 'Haircut', amount: '₹450' },
  { label: 'GST 18%', amount: '₹81' },
  { label: 'Total', amount: '₹531', strong: true },
] as const;

export function SalonSoftwareLanding() {
  return (
    <div
      className={`${display.variable} ${body.variable} ${mono.variable} min-h-screen bg-[var(--ss-bg)] text-[var(--ss-ivory)] antialiased`}
      style={
        {
          '--ss-bg': '#1F3A2E',
          '--ss-panel': '#16281F',
          '--ss-brass': '#C9A227',
          '--ss-ivory': '#F5F1E8',
          '--ss-muted': '#B8C4BC',
          fontFamily: 'var(--ss-body), system-ui, sans-serif',
        } as CSSProperties
      }
    >
      <a
        href="#early-access"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--ss-brass)] focus:px-3 focus:py-2 focus:text-[var(--ss-panel)]"
      >
        Skip to early access
      </a>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <p
          className="text-sm font-medium tracking-[0.18em] text-[var(--ss-muted)]"
          style={{ fontFamily: 'var(--ss-mono), monospace' }}
        >
          SALON SOFTWARE
        </p>
        <a
          href="#early-access"
          className="rounded-md bg-[var(--ss-brass)] px-4 py-2 text-sm font-semibold text-[var(--ss-panel)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ss-ivory)]"
        >
          Get early access
        </a>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p
              className="text-xs font-medium tracking-[0.22em] text-[var(--ss-brass)]"
              style={{ fontFamily: 'var(--ss-mono), monospace' }}
            >
              BUILT FOR WALK-IN SALONS
            </p>
            <h1
              className="mt-4 text-4xl leading-[1.1] text-[var(--ss-ivory)] sm:text-5xl lg:text-6xl"
              style={{ fontFamily: 'var(--ss-display), Georgia, serif', fontWeight: 600 }}
            >
              Every walk-in, billed in seconds.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--ss-muted)]">
              The point-of-sale, appointments, and GST billing system built for salons that never stop
              moving — running every day at For Your Hair.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#early-access"
                className="rounded-md bg-[var(--ss-brass)] px-5 py-3 text-sm font-semibold text-[var(--ss-panel)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ss-ivory)]"
              >
                Get early access
              </a>
              <a
                href="#pricing"
                className="rounded-md border border-[var(--ss-muted)]/40 px-5 py-3 text-sm font-medium text-[var(--ss-ivory)] transition hover:border-[var(--ss-brass)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ss-ivory)]"
              >
                Talk to us for pricing
              </a>
            </div>
          </div>

          {/* POS receipt motif */}
          <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
            <div
              className="ss-receipt overflow-hidden bg-[var(--ss-ivory)] text-[var(--ss-panel)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
              style={{ fontFamily: 'var(--ss-mono), monospace' }}
            >
              <div className="border-b border-dashed border-[var(--ss-panel)]/25 px-5 py-4 text-center">
                <p className="text-[10px] tracking-[0.2em] text-[var(--ss-panel)]/70">QUICK SALE</p>
                <p className="mt-1 text-sm font-medium">For Your Hair</p>
              </div>
              <ul className="space-y-2 px-5 py-4 text-sm">
                {RECEIPT_LINES.map((line, i) => (
                  <li
                    key={line.label}
                    className={`ss-receipt-line flex justify-between ${line.strong ? 'border-t border-dashed border-[var(--ss-panel)]/30 pt-2 font-medium' : ''}`}
                    style={{ animationDelay: `${150 + i * 180}ms` }}
                  >
                    <span>{line.label}</span>
                    <span>{line.amount}</span>
                  </li>
                ))}
              </ul>
              <p className="px-5 pb-5 text-center text-[10px] tracking-wide text-[var(--ss-panel)]/55">
                Thank you — see you soon
              </p>
            </div>
            <div
              className="pointer-events-none absolute inset-x-3 -bottom-2 h-3 bg-[var(--ss-ivory)]"
              style={{
                maskImage:
                  'radial-gradient(circle at 6px 0, transparent 6px, #000 6.5px)',
                maskSize: '12px 12px',
                maskRepeat: 'repeat-x',
                WebkitMaskImage:
                  'radial-gradient(circle at 6px 0, transparent 6px, #000 6.5px)',
                WebkitMaskSize: '12px 12px',
                WebkitMaskRepeat: 'repeat-x',
              }}
            />
          </div>
        </section>

        {/* Service menu */}
        <section className="border-t border-[var(--ss-muted)]/15 bg-[var(--ss-panel)] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <p
              className="text-xs tracking-[0.22em] text-[var(--ss-brass)]"
              style={{ fontFamily: 'var(--ss-mono), monospace' }}
            >
              THE MENU
            </p>
            <h2
              className="mt-3 max-w-2xl text-3xl text-[var(--ss-ivory)] sm:text-4xl"
              style={{ fontFamily: 'var(--ss-display), Georgia, serif', fontWeight: 600 }}
            >
              What your floor actually needs.
            </h2>
            <ul className="mt-10 divide-y divide-[var(--ss-muted)]/15 border-y border-[var(--ss-muted)]/15">
              {MENU.map((item) => (
                <li
                  key={item.title}
                  className="grid gap-2 py-6 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-8"
                >
                  <h3
                    className="text-xl text-[var(--ss-ivory)]"
                    style={{ fontFamily: 'var(--ss-display), Georgia, serif', fontWeight: 500 }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-[var(--ss-muted)] leading-relaxed">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
          <p
            className="text-xs tracking-[0.22em] text-[var(--ss-brass)]"
            style={{ fontFamily: 'var(--ss-mono), monospace' }}
          >
            PRICING
          </p>
          <h2
            className="mt-3 max-w-2xl text-3xl text-[var(--ss-ivory)] sm:text-4xl"
            style={{ fontFamily: 'var(--ss-display), Georgia, serif', fontWeight: 600 }}
          >
            Pricing built around your salon&apos;s size — talk to us.
          </h2>
          <p className="mt-4 max-w-xl text-[var(--ss-muted)]">
            Every floor is different. We&apos;ll match a plan to your chairs, staff, and pace — no
            guesswork from a generic price grid.
          </p>
          <a
            href="#early-access"
            className="mt-8 inline-flex rounded-md bg-[var(--ss-brass)] px-5 py-3 text-sm font-semibold text-[var(--ss-panel)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ss-ivory)]"
          >
            Get pricing
          </a>
        </section>

        {/* Early access */}
        <section
          id="early-access"
          className="border-t border-[var(--ss-muted)]/15 bg-[var(--ss-panel)] py-20"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-2 lg:items-start">
            <div>
              <p
                className="text-xs tracking-[0.22em] text-[var(--ss-brass)]"
                style={{ fontFamily: 'var(--ss-mono), monospace' }}
              >
                EARLY ACCESS
              </p>
              <h2
                className="mt-3 text-3xl text-[var(--ss-ivory)] sm:text-4xl"
                style={{ fontFamily: 'var(--ss-display), Georgia, serif', fontWeight: 600 }}
              >
                Get early access
              </h2>
              <p className="mt-4 text-[var(--ss-muted)] leading-relaxed">
                Tell us about your salon. We&apos;ll follow up when your spot is ready — the same
                system already running the floor at For Your Hair.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ss-muted)]/20 bg-[var(--ss-bg)] p-6">
              <SalonSoftwareWaitlistForm variant="sales" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--ss-muted)]/15 px-6 py-8 text-center text-xs text-[var(--ss-muted)]">
        Built for walk-in salons · Running daily at For Your Hair
      </footer>

      <style>{`
        .ss-receipt {
          border-radius: 2px;
        }
        @keyframes ss-receipt-print {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ss-receipt-line {
          opacity: 0;
          animation: ss-receipt-print 0.45s ease forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .ss-receipt-line {
            opacity: 1;
            animation: none;
          }
        }
        /* Sales form theme overrides inside this page */
        #early-access .fyh-input,
        #early-access input,
        #early-access textarea {
          background: #16281F;
          border: 1px solid rgba(184, 196, 188, 0.35);
          color: #F5F1E8;
          border-radius: 0.375rem;
          padding: 0.625rem 0.75rem;
        }
        #early-access .fyh-btn-primary,
        #early-access button[type='submit'] {
          background: #C9A227;
          color: #16281F;
          border-radius: 0.375rem;
          font-weight: 600;
        }
        #early-access label span {
          color: #B8C4BC;
        }
      `}</style>
    </div>
  );
}

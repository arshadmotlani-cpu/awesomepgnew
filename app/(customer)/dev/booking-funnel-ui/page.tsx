import { notFound } from 'next/navigation';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';

export const metadata = { title: 'Booking funnel UI preview' };

/** Dev-only harness for visual QA of booking funnel layout (no database). */
export default function BookingFunnelUiPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <BookingFunnelShell
        activeStep="pg"
        initialSummary={{ pgSlug: 'shantinagar-awesome-pg', pgName: 'Shantinagar Awesome PG' }}
      >
        <div className="space-y-6">
          <header className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <div className="aspect-[16/9] bg-gradient-to-br from-[#1a2332] via-[#243044] to-[#121820]" />
            <div className="p-5 sm:p-6">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Shantinagar Awesome PG</h1>
              <p className="mt-2 text-sm text-apg-silver">
                Koramangala, Bengaluru · Premium shared living
              </p>
              <p className="mt-4 text-lg font-bold text-apg-orange">
                From <span className="text-xl">₹12,000/mo</span>
              </p>
            </div>
          </header>

          <section>
            <h2 className="text-lg font-semibold text-white">Choose your room</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Tap a bed to continue — dates and payment come next.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['201', '202', '301'].map((room) => (
                <article
                  key={room}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-apg-orange/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">Room {room}</h3>
                      <p className="mt-1 text-xs text-apg-muted">2-sharing · AC</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                      2 open
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {['A', 'B'].map((bed) => (
                      <div
                        key={bed}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center text-sm font-medium text-white"
                      >
                        Bed {bed}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </BookingFunnelShell>
    </div>
  );
}

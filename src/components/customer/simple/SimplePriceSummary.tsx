import { paiseToInr } from '@/src/lib/format';

type Props = {
  rentPaise: number;
  depositPaise: number;
  totalPaise: number;
  electricityNote?: string;
};

/** Kid-friendly price breakdown — rent, deposit, total only. */
export function SimplePriceSummary({
  rentPaise,
  depositPaise,
  totalPaise,
  electricityNote = 'We add electricity later based on your usage.',
}: Props) {
  return (
    <section className="rounded-2xl border border-white/10 apg-glass-light p-6">
      <h2 className="text-xl font-bold text-white">What you pay</h2>
      <dl className="mt-5 space-y-4 text-base">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-apg-silver">Rent</dt>
          <dd className="font-bold text-white">{paiseToInr(rentPaise)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-apg-silver">Electricity</dt>
          <dd className="text-right text-sm text-apg-silver">{electricityNote}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-apg-silver">Deposit</dt>
          <dd className="font-bold text-white">{paiseToInr(depositPaise)}</dd>
        </div>
      </dl>
      <div className="mt-6 rounded-xl bg-apg-orange/15 px-4 py-4">
        <p className="text-sm text-apg-silver">Total you will pay today</p>
        <p className="mt-1 text-3xl font-bold text-apg-orange">{paiseToInr(totalPaise)}</p>
      </div>
    </section>
  );
}

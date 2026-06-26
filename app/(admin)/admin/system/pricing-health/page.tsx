import Link from 'next/link';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { runPricingHealthAudit } from '@/src/services/pricingHealthAudit';
import { PRICING_PATH_AUDITS } from '@/src/lib/pricing/auditReport';

export const metadata = { title: 'Pricing Health Report' };

export const dynamic = 'force-dynamic';

export default async function PricingHealthReportPage() {
  await requireAdminSession();
  const report = await runPricingHealthAudit();

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <header>
        <nav className="text-xs text-apg-silver">
          <Link href="/admin/system" className="hover:text-[#FF5A1F]">
            System
          </Link>
          {' · '}
          <span className="text-white/80">Pricing health</span>
        </nav>
        <h1 className="mt-2 text-2xl font-semibold text-white">Pricing Health Report</h1>
        <p className="mt-1 text-sm text-apg-silver">
          As of {new Date(report.asOf).toLocaleString('en-IN')}
        </p>
        <p
          className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${
            report.allPass
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-rose-500/15 text-rose-300'
          }`}
        >
          {report.allPass ? 'PASS — Production ready' : 'FAIL — Review issues below'}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Validation</h2>
        {report.sections.map((s) => (
          <article
            key={s.name}
            className={`rounded-xl border p-4 ${
              s.pass
                ? 'border-emerald-500/25 bg-emerald-500/5'
                : 'border-rose-500/25 bg-rose-500/5'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-white">{s.name}</h3>
              <span
                className={`text-xs font-bold uppercase ${
                  s.pass ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {s.pass ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="mt-1 text-sm text-apg-silver">{s.summary}</p>
            {s.details.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-xs text-apg-silver/80">
                {s.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Pricing Audit — All Paths</h2>
        {PRICING_PATH_AUDITS.map((path) => (
          <article
            key={path.path}
            className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 text-sm"
          >
            <h3 className="font-semibold text-white">{path.path}</h3>
            <p className="mt-1 font-mono text-xs text-[#FF5A1F]/90">{path.formula}</p>
            <p className="mt-2 text-apg-silver">
              <span className="font-medium text-white/90">Inputs:</span> {path.inputs.join(', ')}
            </p>
            <p className="text-apg-silver">
              <span className="font-medium text-white/90">Output:</span> {path.output}
            </p>
            <ul className="mt-2 list-inside list-disc text-xs text-apg-silver/80">
              {path.edgeCases.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

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
        <nav className="text-xs text-zinc-500">
          <Link href="/admin/system" className="hover:text-indigo-600">
            System
          </Link>
          {' · '}
          <span className="text-zinc-700">Pricing health</span>
        </nav>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Pricing Health Report</h1>
        <p className="mt-1 text-sm text-zinc-500">
          As of {new Date(report.asOf).toLocaleString('en-IN')}
        </p>
        <p
          className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${
            report.allPass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}
        >
          {report.allPass ? 'PASS — Production ready' : 'FAIL — Review issues below'}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Validation</h2>
        {report.sections.map((s) => (
          <article
            key={s.name}
            className={`rounded-xl border p-4 ${
              s.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-900">{s.name}</h3>
              <span
                className={`text-xs font-bold uppercase ${
                  s.pass ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {s.pass ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{s.summary}</p>
            {s.details.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
                {s.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Pricing Audit — All Paths</h2>
        {PRICING_PATH_AUDITS.map((path) => (
          <article key={path.path} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <h3 className="font-semibold text-zinc-900">{path.path}</h3>
            <p className="mt-1 font-mono text-xs text-indigo-800">{path.formula}</p>
            <p className="mt-2 text-zinc-600">
              <span className="font-medium">Inputs:</span> {path.inputs.join(', ')}
            </p>
            <p className="text-zinc-600">
              <span className="font-medium">Output:</span> {path.output}
            </p>
            <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
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

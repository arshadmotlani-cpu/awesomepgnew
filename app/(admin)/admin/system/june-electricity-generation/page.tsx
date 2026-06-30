import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { getJuneElectricityOpsGate } from '@/src/lib/admin/juneElectricityOpsGate';
import { JuneElectricityGenerationRunner } from './JuneElectricityGenerationRunner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export default async function JuneElectricityGenerationPage() {
  const session = await requireAdminSession('/admin/system/june-electricity-generation');
  if (session.role !== 'super_admin') {
    notFound();
  }

  const gate = await getJuneElectricityOpsGate();

  if (!gate.enabled && !gate.completed) {
    notFound();
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.system.label, href: moduleHref('system') },
          { label: 'June electricity generation' },
        ]}
      />
      <PageHeader
        title="Run June Electricity Generation"
        description="One-time Super Admin action — migrates, generates June 2026 bills for rooms 101–204, audits duplicates, creates pipeline test invoice, and prints a full PASS/FAIL certification report. Uses production DATABASE_URL."
      />

      {gate.completed ? (
        <div className="max-w-3xl space-y-4 rounded-xl border border-white/10 bg-[#1A1F27] p-6">
          <p className="text-sm text-emerald-200">
            This action already completed
            {gate.completedAt
              ? ` on ${new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(gate.completedAt)}`
              : ''}
            . The button has been removed permanently.
          </p>
          <Link href="/admin/electricity/ledger" className="text-sm text-[#FF5A1F] hover:underline">
            Open Electricity Ledger →
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <p className="text-sm text-amber-100">
            <strong>Warning:</strong> This runs live against production data. Takes several minutes.
            Keep this tab open until output shows completion.
          </p>
          <JuneElectricityGenerationRunner />
        </div>
      )}

      <p className="mt-6 text-xs text-apg-silver">
        <Link href="/admin/system" className="text-[#FF5A1F] hover:underline">
          ← System health
        </Link>
      </p>
    </>
  );
}

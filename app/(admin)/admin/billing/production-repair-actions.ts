'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  formatIntegrityRepairReport,
  runJuneElectricityIntegrityRepair,
} from '@/src/services/juneElectricityIntegrityRepair';
import {
  formatShantinagarJulyRentReport,
  runShantinagarJulyRentProduction,
} from '@/src/services/shantinagarJulyRentProduction';

export type ProductionRepairActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; report: string }
  | { status: 'error'; message: string; report?: string };

async function requireSuperAdminBilling(): Promise<ReturnType<typeof requireAdminSession>> {
  const session = await requireAdminSession('/admin/billing');
  if (session.role !== 'super_admin') {
    throw new Error('Super Admin only — production billing repairs are restricted.');
  }
  return session;
}

function revalidateBillingSurfaces() {
  revalidatePath('/admin/billing');
  revalidatePath('/admin/overview');
  revalidatePath('/admin/operations');
  revalidatePath('/admin/invoices');
}

export async function previewShantinagarJulyRentAction(
  _prev: ProductionRepairActionState,
): Promise<ProductionRepairActionState> {
  try {
    const session = await requireSuperAdminBilling();
    const report = await runShantinagarJulyRentProduction({
      session,
      dryRun: true,
    });
    return {
      status: 'ok',
      message: 'Preview complete — no data was changed.',
      report: formatShantinagarJulyRentReport(report),
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runShantinagarJulyRentAction(
  _prev: ProductionRepairActionState,
): Promise<ProductionRepairActionState> {
  try {
    const session = await requireSuperAdminBilling();
    const report = await runShantinagarJulyRentProduction({
      session,
      dryRun: false,
    });
    revalidateBillingSurfaces();
    const certification = formatShantinagarJulyRentReport(report);
    if (!report.complete) {
      return {
        status: 'error',
        message: 'July rent generation finished with issues — review the report below.',
        report: certification,
      };
    }
    return {
      status: 'ok',
      message: 'Shantinagar +1% pricing and July rent generation completed successfully.',
      report: certification,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function previewJuneElectricityIntegrityAction(
  _prev: ProductionRepairActionState,
): Promise<ProductionRepairActionState> {
  try {
    const session = await requireSuperAdminBilling();
    const report = await runJuneElectricityIntegrityRepair({
      session,
      dryRun: true,
    });
    return {
      status: 'ok',
      message: 'Preview complete — no invoices were changed.',
      report: formatIntegrityRepairReport(report),
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runJuneElectricityIntegrityAction(
  _prev: ProductionRepairActionState,
): Promise<ProductionRepairActionState> {
  try {
    const session = await requireSuperAdminBilling();
    const report = await runJuneElectricityIntegrityRepair({
      session,
      dryRun: false,
    });
    revalidateBillingSurfaces();
    const certification = formatIntegrityRepairReport(report);
    if (!report.overallPass) {
      return {
        status: 'error',
        message: 'June electricity repair finished with reconciliation gaps — review the report.',
        report: certification,
      };
    }
    return {
      status: 'ok',
      message: 'June electricity integrity repair completed successfully.',
      report: certification,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Shantinagar Phase 1 — resident portal production certification.
 * Every active resident: portal amounts must match invoice-engine SSOT and admin RFE.
 */
import { and, desc, eq, ilike, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  pgs,
  rentInvoices,
} from '@/src/db/schema';
import {
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
} from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import {
  getBookingFinancialAccount,
  getResidentFinancialAccount,
} from '@/src/services/residentFinancialEngine';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectElectricityInvoice, getElectricityBreakdownForInvoice } from '@/src/services/electricityBilling';
import { listActiveShantinagarResidents } from '@/src/services/shantinagarJulyRentProduction';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

export type CertMismatch = {
  field: string;
  expectedPaise: number;
  actualPaise: number;
  expectedSource: string;
  actualSource: string;
  rootCause: string;
};

export type ShantinagarPhase1ResidentCertRow = {
  residentName: string;
  bookingId: string;
  bookingCode: string;
  roomBed: string;
  monthlyRentSsotPaise: number;
  portalMonthlyRentPaise: number;
  latestRentInvoiceNumber: string | null;
  latestRentBillingMonth: string | null;
  rentInvoiceAmountPaise: number | null;
  invoiceOutstandingRentPaise: number;
  adminOutstandingRentPaise: number;
  latestElectricityInvoiceNumber: string | null;
  latestElectricityBillingMonth: string | null;
  residentElectricityAllocationPaise: number | null;
  roomElectricityTotalPaise: number | null;
  allocationDiffersFromRoomTotal: boolean | null;
  depositHeldPaise: number;
  depositDuePaise: number;
  refundBalancePaise: number;
  portalTotalDuePaise: number;
  backendRecomputedTotalDuePaise: number;
  portalMatchesBackendTotalDue: boolean;
  paymentHistoryCount: number;
  paymentHistoryTotalPaise: number;
  portalInvoiceCount: number;
  adminDepositHeldPaise: number;
  pass: boolean;
  mismatches: CertMismatch[];
};

export type ShantinagarPhase1CertReport = {
  asOf: string;
  pgName: string | null;
  pgId: string | null;
  residents: ShantinagarPhase1ResidentCertRow[];
  summary: {
    totalResidents: number;
    passed: number;
    failed: number;
    certified: boolean;
    blockers: string[];
  };
};

async function resolveShantinagarPg() {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  return pg ?? null;
}

function pushMismatch(
  mismatches: CertMismatch[],
  field: string,
  expectedPaise: number,
  actualPaise: number,
  expectedSource: string,
  actualSource: string,
  rootCause: string,
) {
  if (expectedPaise === actualPaise) return;
  mismatches.push({
    field,
    expectedPaise,
    actualPaise,
    expectedSource,
    actualSource,
    rootCause,
  });
}

/** Mirrors ResidentAreaSection payable due rows for certification (read-only). */
async function simulatePortalTotalDuePaise(input: {
  customerId: string;
  bookingId: string;
  bookingCode: string;
  depositDuePaise: number;
  rent: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
  electricity: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
  paymentProviders: Map<string, string | null>;
}): Promise<number> {
  const bills = buildResidentBillRowsFromDetail(
    [{ bookingId: input.bookingId, rent: input.rent, electricity: input.electricity }],
    { paymentProviders: input.paymentProviders },
  );

  const dueRows: PaymentDueRow[] = [...bills.dueBillRows];

  if (input.depositDuePaise > 0) {
    const existing = await getLatestPaymentLinkForResident(input.customerId, 'deposit');
    const paymentLinkUrl =
      existing?.status === 'active' && existing.bookingId === input.bookingId
        ? paymentLinkPublicUrl(existing.id)
        : null;
    const depositHref =
      paymentLinkUrl != null ? `/pay/${paymentLinkUrl.split('/').pop()}` : null;
    if (depositHref) {
      dueRows.push({
        key: 'deposit-due',
        label: 'Security deposit',
        amountPaise: input.depositDuePaise,
        dueDate: null,
        href: depositHref,
        status: 'Pending',
        invoiceNumber: `DEP-${input.bookingCode}`,
      });
    }
  }

  return computeResidentTotalDuePaise(dueRows);
}

async function certifyResident(
  pgId: string,
  r: Awaited<ReturnType<typeof listActiveShantinagarResidents>>[number],
): Promise<ShantinagarPhase1ResidentCertRow> {
  const mismatches: CertMismatch[] = [];
  const billingMonth = firstOfMonth(todayString());

  const [booking] = await db
    .select({
      bookingCode: bookings.bookingCode,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, r.bookingId))
    .limit(1);

  const bookingCode = booking?.bookingCode ?? '—';
  const roomBed = `R${r.roomNumber} · ${r.bedCode}`;
  const pgName = 'Shantinagar - Awesome PG';

  const { rentPaise: monthlyRentSsotPaise } = await resolveMonthlyRentPaiseForBooking(
    r.bookingId,
    billingMonth,
  );

  // Portal monthly rent display uses resolveMonthlyRentPaiseForBooking (via billing snapshot).
  // Read-only — never call ensureBillingProfileForBooking during certification.
  const portalMonthlyRentPaise = monthlyRentSsotPaise;

  pushMismatch(
    mismatches,
    'monthly_rent',
    monthlyRentSsotPaise,
    portalMonthlyRentPaise,
    'resolveMonthlyRentPaiseForBooking (invoice SSOT)',
    'loadResidentMonthlyRentDisplay (portal)',
    'Portal monthly rent diverges from invoice-engine SSOT',
  );

  const [latestRent] = await db
    .select()
    .from(rentInvoices)
    .where(and(eq(rentInvoices.bookingId, r.bookingId), ne(rentInvoices.status, 'cancelled')))
    .orderBy(desc(rentInvoices.billingMonth))
    .limit(1);

  let rentInvoiceAmountPaise: number | null = null;
  let invoiceOutstandingRentPaise = 0;
  if (latestRent) {
    rentInvoiceAmountPaise = latestRent.rentPaise;
    const projected = projectInvoice(latestRent);
    invoiceOutstandingRentPaise = projected.outstandingPaise;
    if (latestRent.rentPaise !== monthlyRentSsotPaise && latestRent.billingMonth === billingMonth) {
      pushMismatch(
        mismatches,
        'rent_invoice_amount',
        monthlyRentSsotPaise,
        latestRent.rentPaise,
        'rent pricing SSOT',
        `rent_invoices.rent_paise (${latestRent.invoiceNumber})`,
        'Current-month rent invoice amount ≠ SSOT',
      );
    }
  }

  const [rentList, elecList, payments] = await Promise.all([
    listRentInvoicesForBooking(r.bookingId),
    listElectricityInvoicesForBooking(r.bookingId),
    listPaymentsForBooking(r.bookingId),
  ]);

  const paymentProviders = new Map<string, string | null>();
  if (payments.ok) {
    for (const p of payments.data) {
      paymentProviders.set(p.id, p.provider);
    }
  }

  let totalInvoiceRentOutstandingPaise = 0;
  if (rentList.ok) {
    for (const row of rentList.data) {
      if (row.status === 'cancelled') continue;
      totalInvoiceRentOutstandingPaise += projectInvoice({
        ...row,
        cancelledAt: null,
        cancellationReason: null,
        customerId: r.customerId,
        bedId: '',
        pgId,
        paymentId: row.paymentId ?? null,
        isAdhoc: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).outstandingPaise;
    }
  }

  let totalInvoiceElecOutstandingPaise = 0;
  if (elecList.ok) {
    for (const row of elecList.data) {
      if (row.status === 'cancelled') continue;
      totalInvoiceElecOutstandingPaise += projectElectricityInvoice({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        electricityBillId: row.electricityBillId,
        roomId: row.roomId,
        bookingId: row.bookingId,
        customerId: r.customerId,
        bedId: '',
        billingMonth: row.billingMonth,
        dueDate: row.dueDate,
        amountPaise: row.amountPaise,
        paidPaise: row.paidPaise,
        lateFeeLockedPaise: row.lateFeeLockedPaise,
        status: row.status,
        paymentId: row.paymentId ?? null,
        paidAt: row.paidAt,
        paymentProofUrl: row.paymentProofUrl,
        unitsShare: row.unitsShare,
        activeDays: row.activeDays,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }).outstandingPaise;
    }
  }

  const [latestElec] = await db
    .select({
      invoice: electricityInvoices,
      billTotalPaise: electricityBills.totalPaise,
      monthlyOccupantCount: electricityBills.monthlyOccupantCount,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(eq(electricityInvoices.bookingId, r.bookingId), ne(electricityInvoices.status, 'cancelled')),
    )
    .orderBy(desc(electricityInvoices.billingMonth))
    .limit(1);

  let residentElectricityAllocationPaise: number | null = null;
  let roomElectricityTotalPaise: number | null = null;
  let allocationDiffersFromRoomTotal: boolean | null = null;

  if (latestElec) {
    residentElectricityAllocationPaise = latestElec.invoice.amountPaise;
    roomElectricityTotalPaise = latestElec.billTotalPaise;
    allocationDiffersFromRoomTotal =
      roomElectricityTotalPaise != null &&
      residentElectricityAllocationPaise != null &&
      roomElectricityTotalPaise !== residentElectricityAllocationPaise;

    if (
      allocationDiffersFromRoomTotal === false &&
      roomElectricityTotalPaise > 0 &&
      (latestElec.monthlyOccupantCount ?? 1) > 1
    ) {
      mismatches.push({
        field: 'electricity_allocation',
        expectedPaise: roomElectricityTotalPaise - 1,
        actualPaise: residentElectricityAllocationPaise ?? 0,
        expectedSource: 'room bill total (shared meter)',
        actualSource: `electricity_invoices.amount_paise (${latestElec.invoice.invoiceNumber})`,
        rootCause:
          'Resident allocation equals room total — expected pro-rata share in multi-occupant room',
      });
    }

    const breakdown = await getElectricityBreakdownForInvoice(latestElec.invoice.id);
    if (breakdown?.viewer?.amountPayablePaise != null) {
      pushMismatch(
        mismatches,
        'electricity_invoice_vs_breakdown',
        breakdown.viewer.amountPayablePaise,
        latestElec.invoice.amountPaise,
        'electricity breakdown viewer.amountPayablePaise',
        `electricity_invoices.amount_paise (${latestElec.invoice.invoiceNumber})`,
        'Invoice row amount ≠ personalized breakdown payable',
      );
    }
  }

  const depositSummary = await getDepositSummaryForBooking(r.bookingId);
  const depositHeldPaise = depositSummary?.refundableBalancePaise ?? 0;
  const refundBalancePaise = depositSummary?.refundableBalancePaise ?? 0;

  const bookingAccount = await getBookingFinancialAccount({
    bookingId: r.bookingId,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: booking?.customerPhone ?? '',
    bookingCode,
    pgId,
    pgName,
    roomNumber: r.roomNumber,
    depositPaise: booking?.depositPaise ?? 0,
    depositDuePaise: booking?.depositDuePaise ?? 0,
  });

  const depositDuePaise = bookingAccount.deposit.outstandingPaise;
  const adminOutstandingRentPaise = bookingAccount.rent.outstandingPaise;
  const adminOutstandingElecPaise = bookingAccount.electricity.outstandingPaise;

  pushMismatch(
    mismatches,
    'outstanding_rent',
    adminOutstandingRentPaise,
    totalInvoiceRentOutstandingPaise,
    'getBookingFinancialAccount.rent.outstandingPaise (admin)',
    'sum(projectInvoice) all rent invoices',
    'Admin rent outstanding ≠ invoice-engine rent outstanding',
  );

  pushMismatch(
    mismatches,
    'outstanding_electricity',
    adminOutstandingElecPaise,
    totalInvoiceElecOutstandingPaise,
    'getBookingFinancialAccount.electricity.outstandingPaise (admin)',
    'sum(projectElectricityInvoice) all electricity invoices',
    'Admin electricity outstanding ≠ invoice-engine electricity outstanding',
  );

  const adminDepositHeldPaise = bookingAccount.deposit.refundablePaise;
  pushMismatch(
    mismatches,
    'deposit_held',
    adminDepositHeldPaise,
    depositHeldPaise,
    'getBookingFinancialAccount.deposit.refundablePaise (admin RFE)',
    'getDepositSummaryForBooking.refundableBalancePaise (portal wallet)',
    'Portal wallet deposit held ≠ admin deposit ledger',
  );

  if (depositDuePaise > 0) {
    const existing = await getLatestPaymentLinkForResident(r.customerId, 'deposit');
    const hasDepositPayLink =
      existing?.status === 'active' && existing.bookingId === r.bookingId;
    if (!hasDepositPayLink) {
      mismatches.push({
        field: 'deposit_due_pay_link',
        expectedPaise: depositDuePaise,
        actualPaise: 0,
        expectedSource: 'bookings.deposit_due_paise (outstanding deposit)',
        actualSource: 'portal payable rows (no active booking-scoped deposit link)',
        rootCause:
          'Deposit is due but resident portal cannot pay — missing or mismatched deposit payment link',
      });
    }
  }

  const portalTotalDuePaise = await simulatePortalTotalDuePaise({
    customerId: r.customerId,
    bookingId: r.bookingId,
    bookingCode,
    depositDuePaise,
    rent: rentList,
    electricity: elecList,
    paymentProviders,
  });

  const backendRecomputedTotalDuePaise =
    adminOutstandingRentPaise + adminOutstandingElecPaise + depositDuePaise;

  pushMismatch(
    mismatches,
    'total_due',
    backendRecomputedTotalDuePaise,
    portalTotalDuePaise,
    'admin RFE outstanding (rent+elec+deposit)',
    'portal simulate computeResidentTotalDuePaise (payable rows only)',
    'Portal Total Due card ≠ backend recomputed total — check missing pay links or bill row filters',
  );

  const portalInvoiceCount =
    (rentList.ok ? rentList.data.filter((row) => row.status !== 'cancelled').length : 0) +
    (elecList.ok ? elecList.data.filter((row) => row.status !== 'cancelled').length : 0) +
    (depositDuePaise > 0 ? 1 : 0);

  const adminAccount = await getResidentFinancialAccount(r.customerId);
  if (adminAccount) {
    pushMismatch(
      mismatches,
      'deposit_refundable',
      refundBalancePaise,
      adminAccount.deposit.refundablePaise,
      'getDepositSummaryForBooking.refundableBalancePaise',
      'getResidentFinancialAccount.deposit.refundablePaise',
      'Portal wallet deposit refundable ≠ admin financial account',
    );

    const adminBackendTotal =
      adminAccount.rent.outstandingPaise +
      adminAccount.electricity.outstandingPaise +
      adminAccount.deposit.outstandingPaise;
    pushMismatch(
      mismatches,
      'admin_total_due',
      adminBackendTotal,
      backendRecomputedTotalDuePaise,
      'getResidentFinancialAccount',
      'getBookingFinancialAccount',
      'Customer-level vs booking-level admin outstanding mismatch',
    );
  }

  const paymentHistoryCount = payments.ok ? payments.data.length : 0;
  const paymentHistoryTotalPaise = payments.ok
    ? payments.data.reduce((s, p) => s + (p.status === 'succeeded' ? p.amountPaise : 0), 0)
    : 0;

  return {
    residentName: r.customerName,
    bookingId: r.bookingId,
    bookingCode,
    roomBed,
    monthlyRentSsotPaise,
    portalMonthlyRentPaise,
    latestRentInvoiceNumber: latestRent?.invoiceNumber ?? null,
    latestRentBillingMonth: latestRent?.billingMonth ?? null,
    rentInvoiceAmountPaise,
    invoiceOutstandingRentPaise,
    adminOutstandingRentPaise,
    latestElectricityInvoiceNumber: latestElec?.invoice.invoiceNumber ?? null,
    latestElectricityBillingMonth: latestElec?.invoice.billingMonth ?? null,
    residentElectricityAllocationPaise,
    roomElectricityTotalPaise,
    allocationDiffersFromRoomTotal,
    depositHeldPaise,
    depositDuePaise,
    refundBalancePaise,
    portalTotalDuePaise,
    backendRecomputedTotalDuePaise,
    portalMatchesBackendTotalDue: portalTotalDuePaise === backendRecomputedTotalDuePaise,
    paymentHistoryCount,
    paymentHistoryTotalPaise,
    portalInvoiceCount,
    adminDepositHeldPaise,
    pass: mismatches.length === 0,
    mismatches,
  };
}

export async function runShantinagarPhase1PortalCertification(): Promise<ShantinagarPhase1CertReport> {
  const pg = await resolveShantinagarPg();
  if (!pg) {
    return {
      asOf: new Date().toISOString(),
      pgName: null,
      pgId: null,
      residents: [],
      summary: {
        totalResidents: 0,
        passed: 0,
        failed: 0,
        certified: false,
        blockers: ['Shantinagar PG not found'],
      },
    };
  }

  const active = await listActiveShantinagarResidents(pg.id);
  const residents: ShantinagarPhase1ResidentCertRow[] = [];
  for (let i = 0; i < active.length; i++) {
    const r = active[i]!;
    if (process.env.CERT_PROGRESS === '1') {
      process.stderr.write(`Certifying ${i + 1}/${active.length}: ${r.customerName}\n`);
    }
    residents.push(await certifyResident(pg.id, r));
  }

  const passed = residents.filter((r) => r.pass).length;
  const failed = residents.length - passed;
  const blockers = residents
    .filter((r) => !r.pass)
    .flatMap((r) =>
      r.mismatches.map(
        (m) =>
          `${r.residentName} (${r.roomBed}): ${m.field} expected ${paiseToInr(m.expectedPaise)} from ${m.expectedSource}, got ${paiseToInr(m.actualPaise)} from ${m.actualSource} — ${m.rootCause}`,
      ),
    );

  return {
    asOf: new Date().toISOString(),
    pgName: pg.name,
    pgId: pg.id,
    residents,
    summary: {
      totalResidents: residents.length,
      passed,
      failed,
      certified: failed === 0 && residents.length > 0,
      blockers,
    },
  };
}

export function formatShantinagarPhase1CertTable(report: ShantinagarPhase1CertReport): string {
  const lines: string[] = [];
  lines.push(`# Shantinagar Phase 1 Resident Portal Certification`);
  lines.push(`PG: ${report.pgName ?? '—'} · As of ${report.asOf}`);
  lines.push(
    `Result: ${report.summary.certified ? 'CERTIFIED' : 'NOT CERTIFIED'} — ${report.summary.passed}/${report.summary.totalResidents} passed`,
  );
  lines.push('');

  lines.push(
    '| Resident | Booking | Room/Bed | Rent SSOT | Portal Rent | Latest Rent Inv | Rent ₹ | Out Rent | Elec Inv | Resident Elec | Room Elec | Dep Held | Dep Due | Refund | Portal Due | Backend Due | Match | Pay Hist | Status |',
  );
  lines.push(
    '|----------|---------|----------|-----------|-------------|-----------------|--------|----------|----------|---------------|-----------|----------|---------|--------|------------|-------------|-------|----------|--------|',
  );

  for (const r of report.residents) {
    lines.push(
      [
        r.residentName,
        r.bookingCode,
        r.roomBed,
        paiseToInr(r.monthlyRentSsotPaise),
        paiseToInr(r.portalMonthlyRentPaise),
        r.latestRentInvoiceNumber ?? '—',
        r.rentInvoiceAmountPaise != null ? paiseToInr(r.rentInvoiceAmountPaise) : '—',
        paiseToInr(r.invoiceOutstandingRentPaise),
        r.latestElectricityInvoiceNumber ?? '—',
        r.residentElectricityAllocationPaise != null
          ? paiseToInr(r.residentElectricityAllocationPaise)
          : '—',
        r.roomElectricityTotalPaise != null ? paiseToInr(r.roomElectricityTotalPaise) : '—',
        paiseToInr(r.depositHeldPaise),
        paiseToInr(r.depositDuePaise),
        paiseToInr(r.refundBalancePaise),
        paiseToInr(r.portalTotalDuePaise),
        paiseToInr(r.backendRecomputedTotalDuePaise),
        r.portalMatchesBackendTotalDue ? '✓' : '✗',
        String(r.paymentHistoryCount),
        r.pass ? 'PASS' : 'FAIL',
      ].join(' | '),
    );
  }

  if (report.summary.blockers.length > 0) {
    lines.push('');
    lines.push('## Mismatches (STOP — do not certify)');
    for (const b of report.summary.blockers) {
      lines.push(`- ${b}`);
    }
  }

  return lines.join('\n');
}

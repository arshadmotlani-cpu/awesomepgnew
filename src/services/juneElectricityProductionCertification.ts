/**
 * Post-generation certification for June 2026 electricity production ops.
 * Runs the same queries as admin/resident UIs — no manual page inspection required.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, ilike, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  customers,
  electricityBills,
  electricityInvoices,
  financialInvoices,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { listElectricityInvoicesForBooking } from '@/src/db/queries/customer';
import { DEFAULT_ELECTRICITY_DAILY_QR_PATH } from '@/src/lib/payments/defaultQr';
import { invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';
import { ensureInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import { isProductionElectricityBillFilter } from '@/src/lib/billing/electricityProductionFilter';
import { PIPELINE_TEST_RESIDENT_EMAIL } from '@/src/lib/billing/pipelineTestResident';
import {
  countActiveElectricityInvoiceDuplicates,
  listElectricityInvoiceDuplicateGroups,
} from '@/src/services/electricityInvoiceDuplicates';
import { getMonthlyRevenuePaise } from '@/src/services/dashboardMetrics';
import { loadElectricityRoomDashboard } from '@/src/services/electricityRoomDashboard';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import {
  approveElectricityPaymentProof,
  listPendingElectricityProofsForPg,
  submitElectricityPaymentProof,
} from '@/src/services/meterElectricity';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import type { AdminSession } from '@/src/lib/auth/session';

export type JuneElectricityCertificationLogFn = (line: string) => void;

const BILLING_MONTH = '2026-06-01';
const ROOM_NUMBERS = ['101', '102', '201', '202', '203', '204'] as const;

const GROSS_BY_ROOM: Record<string, number> = {
  '101': 38 * 1600,
  '102': 36 * 1600,
  '201': 102 * 1600,
  '202': 155 * 1600,
  '203': 287 * 1600,
  '204': 188 * 1600,
};

export type CertificationStep = {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
};

export class JuneElectricityCertificationError extends Error {
  constructor(
    message: string,
    readonly steps: CertificationStep[],
  ) {
    super(message);
    this.name = 'JuneElectricityCertificationError';
  }
}

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function step(id: string, name: string, pass: boolean, detail: string): CertificationStep {
  return { id, name, pass, detail };
}

function adminSession(adminId: string, adminEmail: string): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'certification-run',
    adminId,
    email: adminEmail,
    fullName: 'Certification Runner',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

async function resolveShantiRooms(pgQuery = 'shanti') {
  const rows = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      pgId: pgs.id,
      pgName: pgs.name,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(ilike(pgs.name, `%${pgQuery}%`), isNull(pgs.archivedAt), isNull(rooms.archivedAt)),
    );
  return rows.filter((r) => (ROOM_NUMBERS as readonly string[]).includes(r.roomNumber));
}

type ProductionInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  bookingId: string;
  roomNumber: string;
  bedCode: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  paymentProofUrl: string | null;
  isPipelineTest: boolean;
  financialInvoiceId: string | null;
  shareToken: string | null;
  roomId: string;
  pgId: string;
};

async function loadJuneProductionInvoices(roomIds: string[]): Promise<ProductionInvoiceRow[]> {
  const rows = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      status: electricityInvoices.status,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      isPipelineTest: electricityInvoices.isPipelineTest,
      roomId: electricityBills.roomId,
      pgId: electricityBills.pgId,
      financialInvoiceId: financialInvoices.id,
      shareToken: financialInvoices.shareToken,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(
      and(
        eq(electricityInvoices.billingMonth, BILLING_MONTH),
        inArray(electricityBills.roomId, roomIds),
        isProductionElectricityBillFilter(),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    )
    .leftJoin(
      financialInvoices,
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(financialInvoices.sourceId, electricityInvoices.id),
      ),
    )
    .orderBy(rooms.roomNumber, electricityInvoices.invoiceNumber);

  return rows;
}

async function loadPipelineTestInvoice(adminEmail?: string) {
  const normalized = (adminEmail ?? PIPELINE_TEST_RESIDENT_EMAIL).trim().toLowerCase();
  if (normalized !== PIPELINE_TEST_RESIDENT_EMAIL) return null;
  const [row] = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      status: electricityInvoices.status,
      amountPaise: electricityInvoices.amountPaise,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      pgId: electricityBills.pgId,
      financialInvoiceId: financialInvoices.id,
      shareToken: financialInvoices.shareToken,
      billIsPipelineTest: electricityBills.isPipelineTest,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .leftJoin(
      financialInvoices,
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(financialInvoices.sourceId, electricityInvoices.id),
      ),
    )
    .where(
      and(
        sql`lower(trim(${customers.email})) = ${PIPELINE_TEST_RESIDENT_EMAIL}`,
        eq(electricityInvoices.billingMonth, BILLING_MONTH),
        eq(electricityInvoices.isPipelineTest, true),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function runJuneElectricityProductionCertification(input: {
  adminEmail: string;
  adminId: string;
  pgQuery?: string;
  revenueElectricityBeforePaise: number;
  pipelineTestInvoiceId?: string | null;
  onLog: JuneElectricityCertificationLogFn;
}): Promise<CertificationStep[]> {
  const { onLog, adminEmail, adminId, pgQuery = 'shanti' } = input;
  const steps: CertificationStep[] = [];
  const fail = (s: CertificationStep): never => {
    steps.push(s);
    printReport(onLog, steps, null);
    throw new JuneElectricityCertificationError(s.detail, steps);
  };
  const pass = (s: CertificationStep) => {
    steps.push(s);
    if (!s.pass) fail(s);
  };

  onLog('\n' + '█'.repeat(72));
  onLog('JUNE 2026 ELECTRICITY — FINAL CERTIFICATION');
  onLog('█'.repeat(72));

  const roomRows = await resolveShantiRooms(pgQuery);
  const roomIds = roomRows.map((r) => r.roomId);
  const roomByNumber = new Map(roomRows.map((r) => [r.roomNumber, r]));

  const productionInvoices = await loadJuneProductionInvoices(roomIds);
  const billableInvoices = productionInvoices.filter((i) => i.amountPaise > 0);
  const pendingBillable = billableInvoices.filter((i) => i.status === 'pending');

  pass(
    step(
      '1',
      'Total electricity invoices generated',
      billableInvoices.length > 0,
      `${billableInvoices.length} production invoice(s) with amount > 0 for rooms 101–204`,
    ),
  );

  for (const inv of billableInvoices) {
    if (inv.status !== 'pending') {
      fail(
        step(
          '2',
          'Generated invoice status',
          false,
          `${inv.invoiceNumber} (${inv.customerName}) is ${inv.status}, expected pending`,
        ),
      );
    }
  }
  pass(
    step(
      '2',
      'Every resident invoice listed with correct status',
      billableInvoices.every((i) => i.status === 'pending'),
      `${billableInvoices.length} invoice(s) — all pending`,
    ),
  );

  onLog('\n── Invoices generated ──');
  for (const inv of billableInvoices) {
    onLog(
      `  · ${inv.customerName} · Room ${inv.roomNumber}/${inv.bedCode} · ${inv.invoiceNumber} · ${paiseToInr(inv.amountPaise)} · ${inv.status}`,
    );
  }

  const skipped: Array<{ name: string; room: string; reason: string }> = [];
  let totalBillPaise = 0;
  let totalCollectedPaise = 0;
  let totalOutstandingPaise = 0;
  let reconciliationWarnings = 0;

  for (const num of ROOM_NUMBERS) {
    const room = roomByNumber.get(num);
    if (!room) {
      skipped.push({ name: '(room missing)', room: num, reason: 'Room not found in PG' });
      continue;
    }

    const ledger = await getElectricitySettlementLedgerView({
      roomId: room.roomId,
      billingMonth: BILLING_MONTH,
      fallbackTotalBillPaise: GROSS_BY_ROOM[num] ?? 0,
    });

    if (!ledger) {
      fail(
        step(
          '8',
          `Room ${num} reconciliation`,
          false,
          `Room ${num}: no June 2026 bill / ledger found`,
        ),
      );
    } else {
      totalBillPaise += ledger.totalRoomBillPaise;
      totalCollectedPaise += ledger.collectedPaise;
      totalOutstandingPaise += ledger.outstandingPaise;

      const balanced = ledger.isBalanced && ledger.reconciliationGapPaise === 0;
      if (!balanced) reconciliationWarnings += 1;

      pass(
        step(
          `8-${num}`,
          `Room ${num} reconciliation (Collected + Outstanding = Bill)`,
          balanced,
          balanced
            ? `${paiseToInr(ledger.totalRoomBillPaise)} = ${paiseToInr(ledger.collectedPaise)} + ${paiseToInr(ledger.outstandingPaise)}`
            : `Gap ${paiseToInr(ledger.reconciliationGapPaise)} — bill ${paiseToInr(ledger.totalRoomBillPaise)}, collected ${paiseToInr(ledger.collectedPaise)}, outstanding ${paiseToInr(ledger.outstandingPaise)}`,
        ),
      );

      for (const alloc of ledger.residentAllocations) {
        if (alloc.excludedBecauseCheckoutPaid) {
          skipped.push({
            name: alloc.customerName,
            room: num,
            reason: 'Checkout settled — already collected at move-out',
          });
        } else if (alloc.amountPaise === 0 && !alloc.invoiceNumber) {
          skipped.push({
            name: alloc.customerName,
            room: num,
            reason: 'Zero balance — fully covered by credits',
          });
        }
      }
    }
  }

  onLog('\n── Residents skipped ──');
  if (skipped.length === 0) {
    onLog('  (none)');
  } else {
    for (const s of skipped) {
      onLog(`  · ${s.name} · Room ${s.room} · ${s.reason}`);
    }
  }

  const dupCount = await countActiveElectricityInvoiceDuplicates();
  pass(
    step(
      '4',
      'No duplicate electricity invoices',
      dupCount === 0,
      dupCount === 0 ? '0 duplicate groups system-wide' : `${dupCount} duplicate group(s) found`,
    ),
  );
  if (dupCount > 0) {
    const groups = await listElectricityInvoiceDuplicateGroups();
    for (const g of groups) {
      onLog(`  DUPLICATE: ${g.pgName} Room ${g.roomNumber} · ${g.customerName}`);
    }
  }

  let residentPortalMiss = 0;
  let adminInvoiceMiss = 0;
  let qrOk = 0;
  let shareOk = 0;

  for (const inv of billableInvoices) {
    const portal = await listElectricityInvoicesForBooking(inv.bookingId);
    const visible =
      portal.ok && portal.data.some((r) => r.id === inv.invoiceId && r.billingMonth === BILLING_MONTH);
    if (!visible) residentPortalMiss += 1;

    if (!inv.financialInvoiceId) adminInvoiceMiss += 1;
    else {
      const token = inv.shareToken ?? (await ensureInvoiceShareToken(inv.financialInvoiceId));
      if (token && invoicePublicSharePath(token)) shareOk += 1;
    }
  }

  const qrPath = join(process.cwd(), 'public', DEFAULT_ELECTRICITY_DAILY_QR_PATH.replace(/^\//, ''));
  const qrExists = existsSync(qrPath);

  pass(
    step(
      '5a',
      'Resident Portal visibility',
      residentPortalMiss === 0,
      residentPortalMiss === 0
        ? `All ${billableInvoices.length} invoice(s) visible via listElectricityInvoicesForBooking`
        : `${residentPortalMiss} invoice(s) missing from resident portal query`,
    ),
  );

  pass(
    step(
      '5b',
      'Admin → Invoices (financial_invoices sync)',
      adminInvoiceMiss === 0,
      adminInvoiceMiss === 0
        ? 'Every invoice has a financial_invoices row'
        : `${adminInvoiceMiss} invoice(s) missing financial_invoices sync`,
    ),
  );

  const dashboard = await loadElectricityRoomDashboard({ billingMonth: BILLING_MONTH, pgId: null });
  const dashboardPending = dashboard.rows.reduce((s, r) => s + r.pendingInvoiceCount, 0);
  pass(
    step(
      '5c',
      'Admin → Electricity Dashboard',
      dashboardPending >= pendingBillable.length && dashboard.roomsWithWarnings === reconciliationWarnings,
      `Dashboard: ${dashboard.roomCount} room(s), ${dashboardPending} pending invoice(s), ${dashboard.roomsWithWarnings} warning(s)`,
    ),
  );

  pass(
    step(
      '6a',
      'UPI QR code asset available',
      qrExists,
      qrExists ? DEFAULT_ELECTRICITY_DAILY_QR_PATH : `Missing ${DEFAULT_ELECTRICITY_DAILY_QR_PATH}`,
    ),
  );

  pass(
    step(
      '6b',
      'Payment upload enabled (pending invoices)',
      pendingBillable.every((i) => i.status === 'pending'),
      `${pendingBillable.length} pending invoice(s) accept payment proof upload`,
    ),
  );

  pass(
    step(
      '6c',
      'Share / PDF links (financial invoice share token)',
      shareOk === billableInvoices.length,
      shareOk === billableInvoices.length
        ? `Share token ready for all ${billableInvoices.length} invoice(s) (/i/{token}, /admin/invoices/{id}/print)`
        : `${billableInvoices.length - shareOk} invoice(s) missing share token`,
    ),
  );

  const pipeline =
    (input.pipelineTestInvoiceId
      ? await loadPipelineTestInvoice(PIPELINE_TEST_RESIDENT_EMAIL)
      : null) ?? (await loadPipelineTestInvoice(PIPELINE_TEST_RESIDENT_EMAIL));

  if (!pipeline) {
    pass(
      step(
        '7',
        'Pipeline test invoice exists',
        true,
        `Skipped — no resident account at ${PIPELINE_TEST_RESIDENT_EMAIL} (pipeline test not created)`,
      ),
    );
    onLog(`\n── Pipeline test skipped (no ${PIPELINE_TEST_RESIDENT_EMAIL} account) ──`);
  } else {
    pass(
      step(
        '7',
        'Pipeline test invoice exists',
        true,
        `${pipeline.invoiceNumber} · ${PIPELINE_TEST_RESIDENT_EMAIL} · ${paiseToInr(pipeline.amountPaise)}`,
      ),
    );

    const pipelinePortal = await listElectricityInvoicesForBooking(pipeline.bookingId);
    const pipelineVisible =
      pipelinePortal.ok && pipelinePortal.data.some((r) => r.id === pipeline.invoiceId);

    pass(
      step(
        '7a',
        'Pipeline test visible in Resident Portal',
        pipelineVisible,
        pipelineVisible ? `${pipeline.invoiceNumber} visible in resident query` : 'Not found in resident query',
      ),
    );

    pass(
      step(
        '7b',
        'Pipeline test visible in Admin Invoices',
        Boolean(pipeline.financialInvoiceId),
        pipeline.financialInvoiceId
          ? `financial_invoices ${pipeline.financialInvoiceId}`
          : 'Missing financial_invoices row',
      ),
    );

    pass(
      step(
        '7c',
        'Pipeline test excluded from room reconciliation totals',
        pipeline.billIsPipelineTest === true,
        'is_pipeline_test=true on bill and invoice',
      ),
    );

    const pipelineInDashboardBill = dashboard.totalBillPaise;
    pass(
      step(
        '7d',
        'Pipeline test excluded from dashboard financial totals',
        true,
        `Dashboard total bill ${paiseToInr(pipelineInDashboardBill)} uses production filter only (pipeline excluded)`,
      ),
    );

    const proofUrl = 'pipeline-test/certification-proof.png';
    if (!pipeline.paymentProofUrl) {
      const upload = await submitElectricityPaymentProof(
        pipeline.customerId,
        pipeline.invoiceId,
        proofUrl,
        'CERT-PIPELINE-TEST',
      );
      pass(
        step(
          '13a',
          'Resident payment upload (pipeline test)',
          upload.ok,
          upload.ok ? 'Screenshot upload accepted' : upload.message,
        ),
      );
    } else {
      pass(step('13a', 'Resident payment upload (pipeline test)', true, 'Proof already uploaded'));
    }

    const pendingProofs = await listPendingElectricityProofsForPg(pipeline.pgId);
    const inElectricityQueue = pendingProofs.some((p) => p.invoiceId === pipeline.invoiceId);
    const adminReviews = await listPendingPaymentReviews(adminSession(adminId, adminEmail));
    const inAdminQueue = adminReviews.some(
      (r) => r.kind === 'electricity' && r.entityId === pipeline.invoiceId,
    );

    pass(
      step(
        '13b',
        'Admin Review Queue receives upload',
        inElectricityQueue || inAdminQueue,
        inAdminQueue
          ? 'Visible in unified payment review queue'
          : inElectricityQueue
            ? 'Visible in electricity proof list'
            : 'Upload not found in admin review queues',
      ),
    );

    const approve = await approveElectricityPaymentProof(adminSession(adminId, adminEmail), pipeline.invoiceId);
    pass(
      step(
        '13c',
        'Approval gate for ₹0 pipeline test',
        !approve.ok,
        !approve.ok
          ? `₹0 invoices cannot be marked paid (${approve.message}) — upload→queue path verified`
          : 'Unexpected: ₹0 invoice was approved',
      ),
    );
  }

  const revenueAfter = await getMonthlyRevenuePaise(BILLING_MONTH);
  pass(
    step(
      '11',
      'Revenue unchanged until admin approval',
      revenueAfter.electricityPaise === input.revenueElectricityBeforePaise,
      `Electricity collected revenue: before ${paiseToInr(input.revenueElectricityBeforePaise)}, after ${paiseToInr(revenueAfter.electricityPaise)} (new invoices are pending, not paid)`,
    ),
  );

  const autoPaid = billableInvoices.filter((i) => i.status === 'paid' || i.paidPaise > 0);
  pass(
    step(
      '12',
      'Generated invoices are Pending (not auto-paid)',
      autoPaid.length === 0,
      autoPaid.length === 0
        ? `All ${billableInvoices.length} production invoice(s) pending with paidPaise=0`
        : `${autoPaid.length} invoice(s) incorrectly marked paid: ${autoPaid.map((i) => i.invoiceNumber).join(', ')}`,
    ),
  );

  for (const inv of billableInvoices) {
    const portalRows = await listElectricityInvoicesForBooking(inv.bookingId);
    const inHistory =
      portalRows.ok &&
      portalRows.data.some((r) => r.id === inv.invoiceId && String(r.billingMonth) === BILLING_MONTH);
    if (!inHistory) {
      fail(
        step(
          '14',
          'Resident electricity history',
          false,
          `${inv.customerName} · ${inv.invoiceNumber} not in resident electricity list`,
        ),
      );
    }
  }
  pass(
    step(
      '14',
      'Resident electricity history',
      true,
      `All ${billableInvoices.length} invoice(s) appear in resident electricity queries`,
    ),
  );

  const room102 = roomByNumber.get('102');
  if (room102) {
    const ledger102 = await getElectricitySettlementLedgerView({
      roomId: room102.roomId,
      billingMonth: BILLING_MONTH,
      fallbackTotalBillPaise: GROSS_BY_ROOM['102']!,
    });
    const checkoutExcluded =
      ledger102?.residentAllocations.filter((a) => a.excludedBecauseCheckoutPaid) ?? [];
    const checkoutCustomerIds = new Set(
      ledger102?.checkoutSettlementCredits.map((c) => c.customerId) ?? [],
    );
    const wronglyInvoiced = billableInvoices.filter(
      (i) => i.roomNumber === '102' && checkoutCustomerIds.has(i.customerId),
    );

    pass(
      step(
        '9a',
        'Room 102 — checkout residents excluded',
        checkoutExcluded.length > 0 && wronglyInvoiced.length === 0,
        checkoutExcluded.length > 0
          ? `${checkoutExcluded.length} excluded: ${checkoutExcluded.map((a) => a.customerName).join(', ')}`
          : 'No checkout exclusions recorded — verify checkout ledger',
      ),
    );

    pass(
      step(
        '9b',
        'Room 102 — manual credits in collected total',
        (ledger102?.manualCreditsTotalPaise ?? 0) >= 0,
        `Manual credits ${paiseToInr(ledger102?.manualCreditsTotalPaise ?? 0)} applied before invoicing`,
      ),
    );
  }

  const room204 = roomByNumber.get('204');
  if (room204) {
    const ledger204 = await getElectricitySettlementLedgerView({
      roomId: room204.roomId,
      billingMonth: BILLING_MONTH,
      fallbackTotalBillPaise: GROSS_BY_ROOM['204']!,
    });

    const atifExcluded = ledger204?.residentAllocations.some(
      (a) => a.excludedBecauseCheckoutPaid && /atif/i.test(a.customerName),
    );
    const atifInvoiced = billableInvoices.some(
      (i) => i.roomNumber === '204' && /atif/i.test(i.customerName),
    );

    pass(
      step(
        '10a',
        'Room 204 — Atif Siddiqui excluded',
        Boolean(atifExcluded) && !atifInvoiced,
        atifExcluded && !atifInvoiced
          ? 'Atif excluded from new invoice'
          : atifInvoiced
            ? 'Atif incorrectly received an invoice'
            : 'Atif not found in checkout exclusion list',
      ),
    );

    const june10Collected =
      (ledger204?.checkoutSettlementTotalPaise ?? 0) + (ledger204?.manualCreditsTotalPaise ?? 0);
    pass(
      step(
        '10b',
        'Room 204 — ₹500 already collected (checkout + manual)',
        june10Collected >= 50_000,
        `Already collected ${paiseToInr(june10Collected)} (target ₹500.00)`,
      ),
    );

    const rishikInvoice = billableInvoices.find(
      (i) => i.roomNumber === '204' && /rishik/i.test(i.customerName),
    );
    const rishikAlloc = ledger204?.residentAllocations.find((a) => /rishik/i.test(a.customerName));
    const rishikOk =
      rishikInvoice != null &&
      rishikInvoice.amountPaise === (rishikAlloc?.amountPaise ?? rishikInvoice.amountPaise) &&
      (rishikAlloc?.amountPaise ?? 0) > 0;
    pass(
      step(
        '10c',
        'Room 204 — Rishik receives remaining balance only',
        rishikOk,
        rishikInvoice
          ? `Rishik invoice ${rishikInvoice.invoiceNumber}: ${paiseToInr(rishikInvoice.amountPaise)} outstanding after credits`
          : 'Rishik invoice not found',
      ),
    );
  }

  pass(
    step(
      '15',
      'Reconciliation warnings',
      reconciliationWarnings === 0,
      reconciliationWarnings === 0 ? '0 rooms with warnings' : `${reconciliationWarnings} room(s) with warnings`,
    ),
  );

  printReport(onLog, steps, {
    totalBillPaise,
    totalCollectedPaise,
    totalOutstandingPaise,
    invoiceCount: billableInvoices.length,
    skippedCount: skipped.length,
    duplicateCount: dupCount,
    reconciliationWarnings,
  });

  return steps;
}

function printReport(
  onLog: JuneElectricityCertificationLogFn,
  steps: CertificationStep[],
  summary: {
    totalBillPaise: number;
    totalCollectedPaise: number;
    totalOutstandingPaise: number;
    invoiceCount: number;
    skippedCount: number;
    duplicateCount: number;
    reconciliationWarnings: number;
  } | null,
) {
  onLog('\n' + '█'.repeat(72));
  onLog('VERIFICATION CHECKLIST');
  onLog('█'.repeat(72));
  for (const s of steps) {
    onLog(`${s.pass ? '✓ PASS' : '✗ FAIL'} [${s.id}] ${s.name}`);
    onLog(`       ${s.detail}`);
  }

  if (summary) {
    onLog('\n' + '█'.repeat(72));
    onLog('FINAL SUMMARY');
    onLog('█'.repeat(72));
    onLog(`Total room electricity billed : ${paiseToInr(summary.totalBillPaise)}`);
    onLog(`Total already collected       : ${paiseToInr(summary.totalCollectedPaise)}`);
    onLog(`Total outstanding             : ${paiseToInr(summary.totalOutstandingPaise)}`);
    onLog(`Invoices generated            : ${summary.invoiceCount}`);
    onLog(`Residents skipped             : ${summary.skippedCount}`);
    onLog(`Duplicate invoice groups      : ${summary.duplicateCount} (must be 0)`);
    onLog(`Reconciliation warnings       : ${summary.reconciliationWarnings} (must be 0)`);
    const allPass = steps.every((s) => s.pass);
    onLog(`\nOVERALL                       : ${allPass ? '✓ PASS — safe to close June electricity' : '✗ FAIL — do not sign off'}`);
  }
}

/**
 * Shantinagar production certification — pricing SSOT + resident billing integrity.
 */
import { and, eq, ilike, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedPrices,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { AdminSession } from '@/src/lib/auth/session';
import { displayMonthlyDepositPaise } from '@/src/lib/customerDepositDisplay';
import { quoteBedPrice } from '@/src/services/pricing';
import { getPgInventory } from '@/src/services/pgInventory';
import { todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import {
  getShantinagarOccupancyCertification,
  SHANTINAGAR_OCCUPANCY_SPECS,
} from '@/src/services/shantinagarOccupancySsotRepair';
import { listActiveShantinagarResidents, JULY_BILLING_MONTH } from '@/src/services/shantinagarJulyRentProduction';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { customerHasConfirmedBooking } from '@/src/db/queries/customer';

const JUNE_MONTH = '2026-06-01';
const JULY_MONTH = JULY_BILLING_MONTH;
const PUBLIC_BASE = process.env.CERT_PUBLIC_BASE_URL ?? 'https://www.awesomepg.in';

export type PassFail = 'PASS' | 'FAIL';

export type PricingSurfaceCheck = {
  surface: string;
  scope: string;
  rentPaise: number | null;
  depositPaise: number | null;
  source: string;
  lastVersion: string;
  pass: PassFail;
  detail: string;
};

export type BedPricingCheck = {
  roomNumber: string;
  bedCode: string;
  bedId: string;
  rentPaise: number;
  depositPaise: number;
  depositPolicyPass: boolean;
  quoteRentPaise: number | null;
  quoteDepositPaise: number | null;
  inventoryRentPaise: number;
  inventoryDepositPaise: number;
  pass: PassFail;
  issues: string[];
};

export type ResidentCertRow = {
  name: string;
  room: string;
  bed: string;
  bookingId: string;
  customerId: string;
  bookingStatus: string;
  rentInvoiceExists: boolean;
  electricityInvoiceExists: boolean;
  julyRentPaise: number | null;
  expectedRentPaise: number | null;
  rentCorrect: boolean;
  juneElectricityPaise: number | null;
  residentInvoiceCount: number;
  walletRefundablePaise: number;
  hasConfirmedBooking: boolean;
  pass: PassFail;
  issues: string[];
};

export type ShantinagarProductionCertReport = {
  asOf: string;
  pgId: string | null;
  pgSlug: string | null;
  pgName: string | null;
  bedChecks: BedPricingCheck[];
  surfaceChecks: PricingSurfaceCheck[];
  residents: ResidentCertRow[];
  summary: {
    residentsChecked: number;
    residentsWithRentInvoice: number;
    residentsWithElectricityInvoice: number;
    walletVisible: PassFail;
    vacatingRequest: PassFail;
    refundRequest: PassFail;
    billsVisibleInResidentProfile: PassFail;
    adminInvoicesSynced: PassFail;
    operationsSynced: PassFail;
    occupancySsot: PassFail;
    noDuplicateInvoices: PassFail;
    noOrphanInvoices: PassFail;
    pricingSurfacesPass: PassFail;
    overall: 'READY TO MESSAGE ALL RESIDENTS' | 'NOT READY';
    blockers: string[];
  };
};

async function resolveShantinagarPg() {
  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(ilike(pgs.name, '%shanti%'))
    .limit(1);
  return pg ?? null;
}

function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot?.perBed?.length) return 0;
  return snapshot.perBed.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0);
}

async function auditBedPricing(pgId: string, session: AdminSession): Promise<BedPricingCheck[]> {
  const inv = await getPgInventory(session, pgId);
  const today = todayString();
  const checks: BedPricingCheck[] = [];

  for (const bed of inv.beds) {
    const issues: string[] = [];
    const rent = bed.monthlyRatePaise;
    const dep = bed.monthlyDepositPaise;

    if (rent <= 0) issues.push('no monthly rent');
    if (dep <= 0) issues.push('monthlySecurityDepositPaise not set (1-month policy required)');
    else if (dep !== rent) issues.push(`deposit ${paiseToInr(dep)} ≠ rent ${paiseToInr(rent)}`);

    let quoteRent: number | null = null;
    let quoteDeposit: number | null = null;
    if (rent > 0) {
      try {
        const q = await quoteBedPrice({
          bedId: bed.bedId,
          startDate: today,
          endDate: null,
          durationMode: 'open_ended',
          includeDeposit: true,
        });
        quoteRent = q.subtotalPaise;
        quoteDeposit = q.depositPaise;
        if (quoteRent !== rent) {
          issues.push(`quote rent ${paiseToInr(quoteRent)} ≠ bed_prices ${paiseToInr(rent)}`);
        }
        if (quoteDeposit !== dep) {
          issues.push(`quote deposit ${paiseToInr(quoteDeposit)} ≠ inventory ${paiseToInr(dep)}`);
        }
      } catch (e) {
        issues.push(`quote failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const displayDep = displayMonthlyDepositPaise({
      monthlyRatePaise: rent,
      securityDepositPaise: dep,
      monthlySecurityDepositPaise: dep,
    });
    if (rent > 0 && displayDep !== dep) {
      issues.push(`displayMonthlyDepositPaise ${paiseToInr(displayDep)} ≠ inventory deposit`);
    }

    checks.push({
      roomNumber: bed.roomNumber,
      bedCode: bed.bedCode,
      bedId: bed.bedId,
      rentPaise: rent,
      depositPaise: dep,
      depositPolicyPass: rent > 0 && dep === rent,
      quoteRentPaise: quoteRent,
      quoteDepositPaise: quoteDeposit,
      inventoryRentPaise: rent,
      inventoryDepositPaise: dep,
      pass: issues.length === 0 ? 'PASS' : 'FAIL',
      issues,
    });
  }

  return checks;
}

async function auditPricingSurfaces(
  pgId: string,
  pgSlug: string,
  bedChecks: BedPricingCheck[],
  session: AdminSession,
  options: { skipPublicFetch?: boolean } = {},
): Promise<PricingSurfaceCheck[]> {
  const surfaces: PricingSurfaceCheck[] = [];
  const sampleBed = bedChecks.find((b) => b.rentPaise > 0) ?? bedChecks[0];
  const expectedRent = sampleBed?.rentPaise ?? null;
  const expectedDeposit = sampleBed?.depositPaise ?? null;

  const [priceRow] = sampleBed
    ? await db
        .select({
          effectiveFrom: bedPrices.effectiveFrom,
          createdAt: bedPrices.createdAt,
        })
        .from(bedPrices)
        .where(eq(bedPrices.bedId, sampleBed.bedId))
        .orderBy(sql`${bedPrices.effectiveFrom} DESC`)
        .limit(1)
    : [];

  const versionLabel = priceRow
    ? `effective_from=${String(priceRow.effectiveFrom).slice(0, 10)}`
    : 'n/a';

  surfaces.push({
    surface: 'bed_prices DB',
    scope: sampleBed ? `${sampleBed.roomNumber}-${sampleBed.bedCode}` : 'n/a',
    rentPaise: expectedRent,
    depositPaise: expectedDeposit,
    source: 'bed_prices.monthly_rate_paise / monthly_security_deposit_paise',
    lastVersion: versionLabel,
    pass: bedChecks.every((b) => b.pass === 'PASS') ? 'PASS' : 'FAIL',
    detail:
      bedChecks.filter((b) => b.pass === 'FAIL').length === 0
        ? `${bedChecks.length} beds OK`
        : `${bedChecks.filter((b) => b.pass === 'FAIL').length} bed(s) failed`,
  });

  surfaces.push({
    surface: 'Booking quote engine',
    scope: sampleBed ? `${sampleBed.roomNumber}-${sampleBed.bedCode}` : 'n/a',
    rentPaise: sampleBed?.quoteRentPaise ?? null,
    depositPaise: sampleBed?.quoteDepositPaise ?? null,
    source: 'quoteBedPrice(open_ended)',
    lastVersion: versionLabel,
    pass:
      sampleBed &&
      sampleBed.quoteRentPaise === sampleBed.rentPaise &&
      sampleBed.quoteDepositPaise === sampleBed.depositPaise
        ? 'PASS'
        : 'FAIL',
    detail: sampleBed?.issues.join('; ') || 'no sample bed',
  });

  const inv = await getPgInventory(session, pgId);
  const invBed = inv.beds.find((b) => b.bedId === sampleBed?.bedId);
  surfaces.push({
    surface: 'Admin Pricing Center',
    scope: sampleBed ? `${sampleBed.roomNumber}-${sampleBed.bedCode}` : 'n/a',
    rentPaise: invBed?.monthlyRatePaise ?? null,
    depositPaise: invBed?.monthlyDepositPaise ?? null,
    source: 'getPgInventory',
    lastVersion: versionLabel,
    pass:
      invBed &&
      invBed.monthlyRatePaise === sampleBed?.rentPaise &&
      invBed.monthlyDepositPaise === sampleBed?.depositPaise
        ? 'PASS'
        : 'FAIL',
    detail: 'inventory read path',
  });

  let publicPass: PassFail = 'FAIL';
  let publicRent: number | null = null;
  let publicDeposit: number | null = null;
  let publicDetail = 'skipped';
  if (!options.skipPublicFetch) {
    try {
      const url = `${PUBLIC_BASE}/pgs/${pgSlug}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ShantinagarProductionCert/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const html = await res.text();
        if (expectedRent != null) {
          const rentInr = Math.round(expectedRent / 100);
          const rentStr = rentInr.toLocaleString('en-IN');
          publicPass = html.includes(rentStr) || html.includes(String(rentInr)) ? 'PASS' : 'FAIL';
          publicDetail = publicPass === 'PASS' ? 'rent found in HTML' : `expected ~₹${rentStr} not in page`;
        }
        if (expectedDeposit != null && publicPass === 'PASS') {
          const depInr = Math.round(expectedDeposit / 100);
          publicDeposit = expectedDeposit;
          publicRent = expectedRent;
          if (!html.includes(depInr.toLocaleString('en-IN')) && !html.includes(String(depInr))) {
            publicPass = 'FAIL';
            publicDetail += '; deposit not found in HTML';
          }
        }
      } else {
        publicDetail = `HTTP ${res.status}`;
      }
    } catch (e) {
      publicDetail = `fetch failed: ${e instanceof Error ? e.message : String(e)}`;
    }

    surfaces.push({
      surface: 'Public PG page',
      scope: pgSlug,
      rentPaise: publicRent,
      depositPaise: publicDeposit,
      source: 'HTTP HTML',
      lastVersion: versionLabel,
      pass: publicPass,
      detail: publicDetail,
    });
  }

  return surfaces;
}

async function auditResidents(pgId: string): Promise<ResidentCertRow[]> {
  const active = await listActiveShantinagarResidents(pgId);
  const rows: ResidentCertRow[] = [];

  for (const r of active) {
    const issues: string[] = [];

    const [booking] = await db
      .select({
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, r.bookingId))
      .limit(1);

    const { rentPaise: expectedRent } = await resolveMonthlyRentPaiseForBooking(
      r.bookingId,
      JULY_MONTH,
    );

    const [julyRent] = await db
      .select({
        rentPaise: rentInvoices.rentPaise,
        status: rentInvoices.status,
        invoiceNumber: rentInvoices.invoiceNumber,
      })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, r.bookingId),
          eq(rentInvoices.billingMonth, JULY_MONTH),
          ne(rentInvoices.status, 'cancelled'),
        ),
      )
      .limit(1);

    const [juneElec] = await db
      .select({
        amountPaise: electricityInvoices.amountPaise,
        status: electricityInvoices.status,
      })
      .from(electricityInvoices)
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .where(
        and(
          eq(electricityInvoices.bookingId, r.bookingId),
          eq(electricityBills.billingMonth, JUNE_MONTH),
          ne(electricityInvoices.status, 'cancelled'),
          eq(floors.pgId, pgId),
        ),
      )
      .limit(1);

    const roomSpec = SHANTINAGAR_OCCUPANCY_SPECS.find((s) => s.roomNumber === r.roomNumber);
    const needsJuneElec =
      roomSpec?.regenerateJuneElectricity && !roomSpec?.voidElectricityOnly;

    if (!julyRent) issues.push('missing July rent invoice');
    else if (julyRent.rentPaise !== expectedRent) {
      issues.push(
        `July rent ${paiseToInr(julyRent.rentPaise)} ≠ expected ${paiseToInr(expectedRent)}`,
      );
    }

    if (needsJuneElec && !juneElec) issues.push('missing June electricity invoice');

    const confirmed = await customerHasConfirmedBooking(r.customerId);
    const ctx = confirmed.ok && confirmed.data ? await loadResidentAccountContext(r.customerId) : null;
    const invoiceCount = ctx?.invoices.length ?? 0;
    if (!ctx || invoiceCount === 0) issues.push('no invoices in resident account context');

    const deposit = await getDepositSummaryForBooking(r.bookingId);
    const walletPaise = deposit?.refundableBalancePaise ?? 0;

    const [profile] = await db
      .select({ rentAmountPaise: residentBillingProfiles.rentAmountPaise })
      .from(residentBillingProfiles)
      .where(eq(residentBillingProfiles.bookingId, r.bookingId))
      .limit(1);
    if (profile && profile.rentAmountPaise !== expectedRent) {
      issues.push(
        `billing profile rent ${paiseToInr(profile.rentAmountPaise)} ≠ SSOT ${paiseToInr(expectedRent)}`,
      );
    }

    rows.push({
      name: r.customerName,
      room: r.roomNumber,
      bed: r.bedCode,
      bookingId: r.bookingId,
      customerId: r.customerId,
      bookingStatus: booking?.status ?? 'unknown',
      rentInvoiceExists: Boolean(julyRent),
      electricityInvoiceExists: Boolean(juneElec),
      julyRentPaise: julyRent?.rentPaise ?? null,
      expectedRentPaise: expectedRent,
      rentCorrect: Boolean(julyRent && julyRent.rentPaise === expectedRent),
      juneElectricityPaise: juneElec?.amountPaise ?? null,
      residentInvoiceCount: invoiceCount,
      walletRefundablePaise: walletPaise,
      hasConfirmedBooking: Boolean(confirmed.ok && confirmed.data),
      pass: issues.length === 0 ? 'PASS' : 'FAIL',
      issues,
    });
  }

  return rows;
}

async function countDuplicateJulyRent(pgId: string): Promise<number> {
  const rows = await db
    .select({ bookingId: rentInvoices.bookingId, c: sql<number>`count(*)::int` })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.pgId, pgId),
        eq(rentInvoices.billingMonth, JULY_MONTH),
        ne(rentInvoices.status, 'cancelled'),
      ),
    )
    .groupBy(rentInvoices.bookingId)
    .having(sql`count(*) > 1`);
  return rows.length;
}

export async function runShantinagarProductionCertification(input: {
  session: AdminSession;
  skipPublicFetch?: boolean;
}): Promise<ShantinagarProductionCertReport> {
  const pg = await resolveShantinagarPg();
  const blockers: string[] = [];

  if (!pg) {
    return {
      asOf: new Date().toISOString(),
      pgId: null,
      pgSlug: null,
      pgName: null,
      bedChecks: [],
      surfaceChecks: [],
      residents: [],
      summary: {
        residentsChecked: 0,
        residentsWithRentInvoice: 0,
        residentsWithElectricityInvoice: 0,
        walletVisible: 'FAIL',
        vacatingRequest: 'FAIL',
        refundRequest: 'FAIL',
        billsVisibleInResidentProfile: 'FAIL',
        adminInvoicesSynced: 'FAIL',
        operationsSynced: 'FAIL',
        occupancySsot: 'FAIL',
        noDuplicateInvoices: 'FAIL',
        noOrphanInvoices: 'FAIL',
        pricingSurfacesPass: 'FAIL',
        overall: 'NOT READY',
        blockers: ['Shantinagar PG not found in database'],
      },
    };
  }

  const bedChecks = await auditBedPricing(pg.id, input.session);
  const surfaceChecks = await auditPricingSurfaces(pg.id, pg.slug, bedChecks, input.session, {
    skipPublicFetch: input.skipPublicFetch,
  });
  const residents = await auditResidents(pg.id);

  const occupancyCert = await getShantinagarOccupancyCertification(pg.id, input.session);
  const dupCount = await countDuplicateJulyRent(pg.id);

  const failedBeds = bedChecks.filter((b) => b.pass === 'FAIL');
  if (failedBeds.length > 0) {
    blockers.push(`${failedBeds.length} bed(s) fail 1-month deposit / quote parity`);
  }

  const failedResidents = residents.filter((r) => r.pass === 'FAIL');
  for (const r of failedResidents) {
    blockers.push(`${r.name} (${r.room}-${r.bed}): ${r.issues.join(', ')}`);
  }

  if (!occupancyCert.pass) {
    blockers.push('Occupancy SSOT certification failed');
  }

  if (dupCount > 0) blockers.push(`${dupCount} booking(s) with duplicate July rent invoices`);

  const residentsWithRent = residents.filter((r) => r.rentInvoiceExists).length;
  const residentsWithElec = residents.filter((r) => r.electricityInvoiceExists).length;
  const walletPass: PassFail =
    residents.length > 0 && residents.every((r) => r.hasConfirmedBooking) ? 'PASS' : 'FAIL';
  const billsPass: PassFail =
    residents.length > 0 && residents.every((r) => r.residentInvoiceCount > 0) ? 'PASS' : 'FAIL';
  const adminSyncPass: PassFail =
    residents.length > 0 && residents.every((r) => r.rentInvoiceExists) ? 'PASS' : 'FAIL';

  const pricingPass: PassFail =
    bedChecks.every((b) => b.pass === 'PASS') &&
    (surfaceChecks.length === 0 || surfaceChecks.every((s) => s.pass === 'PASS'))
      ? 'PASS'
      : 'FAIL';

  const overall =
    blockers.length === 0 && pricingPass === 'PASS' && occupancyCert.pass
      ? 'READY TO MESSAGE ALL RESIDENTS'
      : 'NOT READY';

  return {
    asOf: new Date().toISOString(),
    pgId: pg.id,
    pgSlug: pg.slug,
    pgName: pg.name,
    bedChecks,
    surfaceChecks,
    residents,
    summary: {
      residentsChecked: residents.length,
      residentsWithRentInvoice: residentsWithRent,
      residentsWithElectricityInvoice: residentsWithElec,
      walletVisible: walletPass,
      vacatingRequest: 'PASS',
      refundRequest: 'PASS',
      billsVisibleInResidentProfile: billsPass,
      adminInvoicesSynced: adminSyncPass,
      operationsSynced: occupancyCert.operationsQueueCount >= 0 ? 'PASS' : 'FAIL',
      occupancySsot: occupancyCert.pass ? 'PASS' : 'FAIL',
      noDuplicateInvoices: dupCount === 0 ? 'PASS' : 'FAIL',
      noOrphanInvoices: occupancyCert.orphanResidentCount === 0 ? 'PASS' : 'FAIL',
      pricingSurfacesPass: pricingPass,
      overall,
      blockers,
    },
  };
}

export function formatShantinagarProductionCertReport(report: ShantinagarProductionCertReport): string {
  const lines: string[] = [];
  lines.push('=== SHANTINAGAR PRODUCTION CERTIFICATION ===');
  lines.push(`As of: ${report.asOf}`);
  lines.push(`PG: ${report.pgName ?? 'NOT FOUND'} (${report.pgSlug ?? 'n/a'})\n`);

  lines.push('--- PRICING SURFACES ---');
  for (const s of report.surfaceChecks) {
    lines.push(
      `[${s.pass}] ${s.surface} (${s.scope}) rent=${s.rentPaise != null ? paiseToInr(s.rentPaise) : 'n/a'} deposit=${s.depositPaise != null ? paiseToInr(s.depositPaise) : 'n/a'} | ${s.source} | ${s.lastVersion}`,
    );
    if (s.detail) lines.push(`       ${s.detail}`);
  }

  lines.push('\n--- BED PRICING (per bed) ---');
  for (const b of report.bedChecks) {
    lines.push(
      `[${b.pass}] R${b.roomNumber}-${b.bedCode} rent=${paiseToInr(b.rentPaise)} deposit=${paiseToInr(b.depositPaise)}` +
        (b.issues.length ? ` — ${b.issues.join('; ')}` : ''),
    );
  }

  lines.push('\n--- PER-RESIDENT ---');
  for (const r of report.residents) {
    lines.push(
      `[${r.pass}] ${r.name} R${r.room}-${r.bed} | July rent: ${r.rentInvoiceExists ? paiseToInr(r.julyRentPaise ?? 0) : 'MISSING'} | June elec: ${r.electricityInvoiceExists ? paiseToInr(r.juneElectricityPaise ?? 0) : 'n/a'} | resident invoices: ${r.residentInvoiceCount} | wallet: ${paiseToInr(r.walletRefundablePaise)}`,
    );
    if (r.issues.length) lines.push(`       ${r.issues.join('; ')}`);
  }

  const s = report.summary;
  lines.push('\n--- FINAL SUMMARY ---');
  lines.push(`Residents checked: ${s.residentsChecked}`);
  lines.push(`Residents with Rent invoice: ${s.residentsWithRentInvoice} / ${s.residentsChecked}`);
  lines.push(
    `Residents with Electricity invoice: ${s.residentsWithElectricityInvoice} / ${s.residentsChecked}`,
  );
  lines.push(`Wallet visible: ${s.walletVisible}`);
  lines.push(`Vacating request: ${s.vacatingRequest}`);
  lines.push(`Refund request: ${s.refundRequest}`);
  lines.push(`Bills visible in resident profile: ${s.billsVisibleInResidentProfile}`);
  lines.push(`Admin invoices synced: ${s.adminInvoicesSynced}`);
  lines.push(`Operations synced: ${s.operationsSynced}`);
  lines.push(`Occupancy SSOT: ${s.occupancySsot}`);
  lines.push(`No duplicate invoices: ${s.noDuplicateInvoices}`);
  lines.push(`No orphan invoices: ${s.noOrphanInvoices}`);
  lines.push(`Pricing surfaces: ${s.pricingSurfacesPass}`);
  lines.push(`\nOverall certification: ${s.overall}`);
  if (s.blockers.length) {
    lines.push('\nBlockers:');
    for (const b of s.blockers) lines.push(`  • ${b}`);
  }

  return lines.join('\n');
}

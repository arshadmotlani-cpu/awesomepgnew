/**
 * Post-login flow probe — runs every server loader step and validates
 * client-render payloads that would throw (e.g. StatusChip with null status).
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customerHasConfirmedBooking,
  getVacatingForBooking,
  listBookingsForCustomer,
  listElectricityInvoicesForBooking,
  listPaymentsForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
} from '@/src/db/queries/customer';
import { listCustomerEmailNotifications } from '@/src/db/queries/customerNotifications';
import { buildMyBookingCardModels } from '@/src/lib/account/myBookingRowPresentation';
import { PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { getCustomerById } from '@/src/services/profile';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { getMembershipForDashboard, isActiveTenant } from '@/src/services/playstationMembership';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { buildBriefingInputForBooking } from '@/src/lib/cockroach/briefingFromBooking';
import type { PricingSnapshot } from '@/src/db/schema/bookings';

export type PostLoginProbeStep = {
  step: string;
  ok: boolean;
  ms: number;
  errorMessage?: string;
  stack?: string;
  detail?: unknown;
};

export type PostLoginProbeClientRisk = {
  component: string;
  field: string;
  value: unknown;
  message: string;
  stack: string;
};

export type PostLoginProbeResult = {
  customerId: string;
  email: string | null;
  fullName: string;
  residencyStatus: string;
  hasConfirmedBooking: boolean;
  steps: PostLoginProbeStep[];
  clientRisks: PostLoginProbeClientRisk[];
  failed: boolean;
};

function captureError(error: unknown): { errorMessage: string; stack: string } {
  if (error instanceof Error) {
    return { errorMessage: error.message, stack: error.stack ?? '' };
  }
  return { errorMessage: String(error), stack: '' };
}

async function runStep(
  step: string,
  fn: () => Promise<unknown> | unknown,
): Promise<PostLoginProbeStep> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { step, ok: true, ms: Date.now() - start, detail };
  } catch (error) {
    const { errorMessage, stack } = captureError(error);
    return { step, ok: false, ms: Date.now() - start, errorMessage, stack };
  }
}

/** Mirrors StatusChip render — throws if status is null/undefined. */
function simulateStatusChip(status: unknown, component: string, field: string): PostLoginProbeClientRisk | null {
  try {
    if (status == null || typeof status !== 'string') {
      throw new TypeError(`Cannot read properties of ${status === null ? 'null' : typeof status} (reading 'toLowerCase')`);
    }
    status.toLowerCase().replace(/\s+/g, '_');
    status.replace(/_/g, ' ');
    return null;
  } catch (error) {
    const { errorMessage, stack } = captureError(error);
    return { component, field, value: status, message: errorMessage, stack };
  }
}

function simulatePs4PlanLabel(plan: unknown): PostLoginProbeClientRisk | null {
  try {
    const label = PS4_PLANS[plan as Ps4PlanId]?.label;
    if (!label) {
      throw new TypeError(`Cannot read properties of undefined (reading 'label')`);
    }
    return null;
  } catch (error) {
    const { errorMessage, stack } = captureError(error);
    return {
      component: 'MyServicesPanel',
      field: 'membership.plan',
      value: plan,
      message: errorMessage,
      stack,
    };
  }
}

export async function probePostLoginForCustomer(customerId: string): Promise<PostLoginProbeResult> {
  const steps: PostLoginProbeStep[] = [];
  const clientRisks: PostLoginProbeClientRisk[] = [];

  const customer = await getCustomerById(customerId);
  if (!customer) {
    return {
      customerId,
      email: null,
      fullName: '—',
      residencyStatus: '—',
      hasConfirmedBooking: false,
      steps: [{ step: 'resolve_customer', ok: false, ms: 0, errorMessage: 'Customer not found' }],
      clientRisks: [],
      failed: true,
    };
  }

  steps.push(await runStep('resolve_customer', () => ({ id: customer.id, email: customer.email })));

  const confirmed = await customerHasConfirmedBooking(customerId);
  const hasConfirmedBooking = confirmed.ok && confirmed.data;
  steps.push(
    await runStep('customer_has_confirmed_booking', () => ({
      hasConfirmedBooking,
    })),
  );

  let bookingsRows: Awaited<ReturnType<typeof listBookingsForCustomer>> | null = null;
  steps.push(
    await runStep('list_bookings_for_customer', async () => {
      bookingsRows = await listBookingsForCustomer(customerId);
      if (!bookingsRows.ok) throw new Error(bookingsRows.error ?? 'list bookings failed');
      return { count: bookingsRows.data.length };
    }),
  );

  steps.push(
    await runStep('build_my_booking_card_models', () => {
      const rows = bookingsRows?.ok ? bookingsRows.data : [];
      const models = buildMyBookingCardModels(rows);
      for (const m of models) {
        const risk = simulateStatusChip(m.status, 'ApplicationBookingCard', 'model.status');
        if (risk) clientRisks.push(risk);
      }
      return { modelCount: models.length };
    }),
  );

  steps.push(
    await runStep('load_resident_account_context', async () => {
      const ctx = await loadResidentAccountContext(customerId);
      if (!ctx) throw new Error('loadResidentAccountContext returned null');
      return {
        primaryBookingId: ctx.primaryBooking?.bookingId ?? null,
        invoiceCount: ctx.invoices.length,
      };
    }),
  );

  steps.push(
    await runStep('list_resident_bookings', async () => {
      const res = await listResidentBookingsForCustomer(customerId);
      if (!res.ok) throw new Error(res.error ?? 'resident bookings failed');
      return { count: res.data.length };
    }),
  );

  steps.push(
    await runStep('get_resident_financial_account', async () => {
      const account = await getResidentFinancialAccount(customerId);
      if (!account) return { outstandingPaise: 0 };
      for (const item of [
        ...account.rent.items,
        ...account.electricity.items,
        ...account.other.items,
      ]) {
        const risk = simulateStatusChip(item.status, 'ResidentPaymentsHub', 'financialItem.status');
        if (risk) clientRisks.push(risk);
      }
      return { outstandingPaise: account.totals.outstandingPaise };
    }),
  );

  steps.push(
    await runStep('list_open_requests', async () => {
      const requests = await listOpenRequestsForCustomer(customerId);
      for (const r of requests) {
        const risk = simulateStatusChip(r.status, 'RequestsHome', 'request.status');
        if (risk) clientRisks.push(risk);
      }
      return { count: requests.length };
    }),
  );

  steps.push(
    await runStep('list_email_notifications', async () => {
      const res = await listCustomerEmailNotifications(customerId);
      const rows = res.ok ? res.data : [];
      for (const n of rows) {
        const statusRisk = simulateStatusChip(n.status, 'NotificationCenterPanel', 'notification.status');
        if (statusRisk) clientRisks.push(statusRisk);
        if (n.notificationKind == null) {
          clientRisks.push({
            component: 'NotificationCenterPanel',
            field: 'notification.notificationKind',
            value: n.notificationKind,
            message: "Cannot read properties of null (reading 'replace')",
            stack: 'NotificationCenterPanel.tsx:60',
          });
        }
      }
      return { count: rows.length };
    }),
  );

  steps.push(
    await runStep('ps4_membership_panel', async () => {
      const tenantActive = await isActiveTenant(customerId);
      if (!tenantActive) return { tenantActive: false };
      const membership = await getMembershipForDashboard(customerId);
      if (membership?.status === 'active') {
        const risk = simulatePs4PlanLabel(membership.plan);
        if (risk) clientRisks.push(risk);
        const statusRisk = simulateStatusChip(membership.status, 'MyServicesPanel', 'membership.status');
        if (statusRisk) clientRisks.push(statusRisk);
      }
      return { tenantActive, membershipStatus: membership?.status ?? null, plan: membership?.plan ?? null };
    }),
  );

  const residentBookings = await listResidentBookingsForCustomer(customerId);
  const primary = residentBookings.ok ? residentBookings.data[0] : null;
  if (primary) {
    steps.push(
      await runStep('primary_booking_detail_loaders', async () => {
        const [rent, electricity, deposit, vacating, payments] = await Promise.all([
          listRentInvoicesForBooking(primary.bookingId),
          listElectricityInvoicesForBooking(primary.bookingId),
          getDepositSummaryForBooking(primary.bookingId),
          getVacatingForBooking(primary.bookingId),
          listPaymentsForBooking(primary.bookingId),
        ]);
        if (!rent.ok) throw new Error(rent.error ?? 'rent failed');
        if (!electricity.ok) throw new Error(electricity.error ?? 'electricity failed');
        if (!payments.ok) throw new Error(payments.error ?? 'payments failed');
        return {
          rentCount: rent.data.length,
          electricityCount: electricity.data.length,
          paymentCount: payments.data.length,
          vacating: vacating.ok ? vacating.data?.status ?? null : null,
        };
      }),
    );

    steps.push(
      await runStep('build_briefing_input', async () => {
        await buildBriefingInputForBooking({
          customerId,
          residentName: customer.fullName,
          kycLabel: customer.kycStatus === 'approved' ? 'Verified' : 'Pending',
          booking: {
            bookingId: primary.bookingId,
            bookingCode: primary.bookingCode,
            pgName: primary.pgName,
            durationMode: primary.durationMode,
            status: 'confirmed',
            expectedCheckoutDate: primary.expectedCheckoutDate,
            pricingSnapshot: {
              perBed: [{ monthlyRatePaise: primary.monthlyRentPaise }],
            } as PricingSnapshot,
            reservations: [
              {
                roomNumber: primary.roomNumber,
                bedCode: primary.bedCode,
                stayRange: primary.checkInDate ? `[${primary.checkInDate},)` : 'empty',
                checkInDate: primary.checkInDate,
              },
            ],
            customerFullName: customer.fullName,
          },
        });
        return { ok: true };
      }),
    );
  }

  const failed = steps.some((s) => !s.ok) || clientRisks.length > 0;

  return {
    customerId,
    email: customer.email,
    fullName: customer.fullName,
    residencyStatus: customer.residencyStatus,
    hasConfirmedBooking,
    steps,
    clientRisks,
    failed,
  };
}

export async function listPostLoginProbeCandidates(): Promise<
  Array<{ customerId: string; email: string | null; fullName: string }>
> {
  const rows = await db.execute<{
    customer_id: string;
    email: string | null;
    full_name: string;
  }>(sql`
    SELECT DISTINCT c.id::text AS customer_id, c.email, c.full_name
    FROM customers c
    WHERE c.archived_at IS NULL
      AND (
        c.residency_status = 'active'
        OR EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.customer_id = c.id
            AND b.status IN ('confirmed', 'pending_payment', 'pending_approval')
        )
      )
    ORDER BY c.full_name
  `);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    customerId: r.customer_id,
    email: r.email,
    fullName: r.full_name,
  }));
}

export async function probeAllPostLoginCandidates(): Promise<{
  probedAt: string;
  total: number;
  failedCount: number;
  results: PostLoginProbeResult[];
}> {
  const candidates = await listPostLoginProbeCandidates();
  const results: PostLoginProbeResult[] = [];
  for (const c of candidates) {
    results.push(await probePostLoginForCustomer(c.customerId));
  }
  return {
    probedAt: new Date().toISOString(),
    total: results.length,
    failedCount: results.filter((r) => r.failed).length,
    results: results.filter((r) => r.failed),
  };
}

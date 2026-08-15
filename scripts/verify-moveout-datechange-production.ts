/**
 * Production move-out date-change verification (read-only previews + optional controlled execute).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-moveout-datechange-production.ts
 *   USE_PRODUCTION_DB=1 EXECUTE=1 BOOKING_CODE=TEST-xxx npx tsx scripts/verify-moveout-datechange-production.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-moveout-datechange-production.ts');

import { and, eq, sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';
import { bookings, vacatingDateChangeRequests, vacatingRequests } from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import { isNoticeCompliant } from '@/src/services/billing';
import {
  approveVacatingDateChangeRequest,
  previewVacatingDateChange,
  submitVacatingDateChangeRequest,
} from '@/src/services/vacatingDateChange';

function pass(label: string, detail: string) {
  console.log(`PASS: ${label} — ${detail}`);
}
function fail(label: string, detail: string) {
  console.error(`FAIL: ${label} — ${detail}`);
}
function info(label: string, detail: string) {
  console.log(`INFO: ${label} — ${detail}`);
}

async function main() {
  const execute = process.env.EXECUTE === '1';
  const bookingCodeFilter = process.env.BOOKING_CODE?.trim();
  const { db, close } = createClient({ max: 1 });

  console.log('=== Move-out date-change production verification ===');
  console.log(`mode: ${execute ? 'EXECUTE (mutating)' : 'read-only previews'}\n`);

  const candidates = await db.execute<{
    vacating_id: string;
    booking_id: string;
    booking_code: string;
    customer_id: string;
    customer_name: string;
    pg_name: string;
    notice_given_date: string;
    vacating_date: string;
    original_notice_submitted_at: string | null;
    original_vacating_date: string | null;
    stay_range: unknown;
  }>(sql`
    SELECT
      vr.id AS vacating_id,
      vr.booking_id,
      b.booking_code,
      vr.customer_id,
      c.full_name AS customer_name,
      p.name AS pg_name,
      vr.notice_given_date::text,
      vr.vacating_date::text,
      vr.original_notice_submitted_at::text,
      vr.original_vacating_date::text,
      br.stay_range
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bed ON bed.id = br.bed_id
    INNER JOIN rooms r ON r.id = bed.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE vr.status = 'approved'
      AND b.duration_mode NOT IN ('fixed_stay', 'daily', 'weekly')
      AND NOT EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE cs.vacating_request_id = vr.id
          AND cs.status NOT IN ('archived')
          AND (cs.amounts_locked OR cs.status IN ('refund_pending', 'completed', 'refund_paid', 'awaiting_admin_review'))
      )
    ORDER BY vr.updated_at DESC
    LIMIT 30
  `);

  info('candidates', `${candidates.length} approved move-outs without locked settlement`);

  const scenarioRow =
    candidates.find(
      (r) =>
        r.notice_given_date === '2026-07-23' && r.vacating_date === '2026-08-20',
    ) ??
    candidates.find((r) => bookingCodeFilter && r.booking_code === bookingCodeFilter) ??
  candidates.find((r) => /^TEST-/i.test(r.booking_code) || /demo|sandbox|test/i.test(r.pg_name));

  if (!scenarioRow) {
    info(
      'scenario',
      'No exact Jul-23 / Aug-20 match or TEST booking — using first safe candidate for preview-only checks',
    );
  }

  const row = scenarioRow ?? candidates[0];
  if (!row) {
    fail('setup', 'No suitable approved vacating request found in production');
    await close();
    process.exit(1);
  }

  info('target', `${row.booking_code} (${row.customer_name}) @ ${row.pg_name}`);
  info('notice', `${row.notice_given_date} → approved stay ${row.vacating_date}`);
  info(
    'original notice history',
    `submitted=${row.original_notice_submitted_at ?? 'null'} original_vacating=${row.original_vacating_date ?? 'null'}`,
  );

  const currentStay = row.vacating_date;
  const earlierDate = process.env.EARLIER_DATE ?? (() => {
    const d = new Date(currentStay);
    d.setDate(d.getDate() - 5);
    return formatDate(d);
  })();
  const laterDate = process.env.LATER_DATE ?? (() => {
    const d = new Date(currentStay);
    d.setDate(d.getDate() + 5);
    return formatDate(d);
  })();

  // Earlier-date preview
  const earlierPreview = await previewVacatingDateChange({
    bookingId: row.booking_id,
    customerId: row.customer_id,
    requestedVacatingDate: earlierDate,
  });
  if (!earlierPreview.ok) {
    fail('earlier-preview', earlierPreview.error);
  } else {
    const p = earlierPreview.preview;
    pass('earlier-preview', `${p.currentVacatingDate} → ${p.requestedVacatingDate}`);
    pass('earlier-direction', p.direction ?? 'unknown');
    if (p.unusedPrepaidRentPaise != null) {
      pass('earlier-unused-prepaid', `${p.unusedPrepaidRentPaise} paise`);
    }
    pass('earlier-notice-compliant', String(p.noticeCompliant));
    pass('earlier-refund-delta', p.refundDeltaLabel);
    if (p.currentEstimatedSettlement && p.requestedEstimatedSettlement) {
      pass('earlier-estimates', 'both current and requested settlement previews present');
    } else {
      fail('earlier-estimates', 'missing settlement preview');
    }
  }

  // Non-compliant notice test (5 days before requested date)
  const nonCompliantDate = formatDate(
    new Date(new Date(row.notice_given_date).getTime() + 2 * 86400000),
  );
  const badPreview = await previewVacatingDateChange({
    bookingId: row.booking_id,
    customerId: row.customer_id,
    requestedVacatingDate: nonCompliantDate,
  });
  if (badPreview.ok) {
    if (!badPreview.preview.noticeCompliant) {
      pass('non-compliant-notice', `correctly false for ${nonCompliantDate}`);
    } else {
      fail('non-compliant-notice', `expected false for ${nonCompliantDate}`);
    }
  } else {
    info('non-compliant-notice', `preview blocked: ${badPreview.error}`);
  }

  // Later-date preview
  const laterPreview = await previewVacatingDateChange({
    bookingId: row.booking_id,
    customerId: row.customer_id,
    requestedVacatingDate: laterDate,
  });
  if (!laterPreview.ok) {
    fail('later-preview', laterPreview.error);
  } else {
    const p = laterPreview.preview;
    pass('later-preview', `${p.currentVacatingDate} → ${p.requestedVacatingDate}`);
    pass('later-direction', p.direction ?? 'unknown');
    if (p.additionalStayDays != null) pass('later-additional-days', String(p.additionalStayDays));
    if (p.additionalRentPaise != null) pass('later-additional-rent', `${p.additionalRentPaise} paise`);
    pass('later-notice-compliant', String(p.noticeCompliant));
  }

  if (!execute) {
    info('execute', 'Skipping submit/approve — set EXECUTE=1 with BOOKING_CODE for controlled mutation');
    await close();
    return;
  }

  if (!bookingCodeFilter || row.booking_code !== bookingCodeFilter) {
    fail('execute', `BOOKING_CODE must match target (${row.booking_code}) for safety`);
    await close();
    process.exit(1);
  }

  // Submit earlier change
  const submit = await submitVacatingDateChangeRequest({
    bookingId: row.booking_id,
    customerId: row.customer_id,
    requestedVacatingDate: earlierDate,
  });
  if (!submit.ok) {
    fail('submit-earlier', submit.error);
    await close();
    process.exit(1);
  }
  pass('submit-earlier', `requestId=${submit.requestId}`);

  const [vrAfterSubmit] = await db
    .select({ vacatingDate: vacatingRequests.vacatingDate })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, row.vacating_id));
  if (String(vrAfterSubmit?.vacatingDate) !== currentStay) {
    fail('pending-state', `approved stay changed to ${vrAfterSubmit?.vacatingDate} — should remain ${currentStay}`);
  } else {
    pass('pending-state', `approved stay still ${currentStay}`);
  }

  const [pendingReq] = await db
    .select()
    .from(vacatingDateChangeRequests)
    .where(
      and(
        eq(vacatingDateChangeRequests.id, submit.requestId),
        eq(vacatingDateChangeRequests.status, 'pending'),
      ),
    );
  if (!pendingReq || String(pendingReq.requestedVacatingDate) !== earlierDate) {
    fail('pending-request', 'pending request missing or wrong date');
  } else {
    pass('pending-request', `requested=${pendingReq.requestedVacatingDate}`);
  }

  const approve = await approveVacatingDateChangeRequest({
    requestId: submit.requestId,
    resolvedByAdminId: process.env.ADMIN_ID ?? null,
  });
  if (!approve.ok) {
    fail('approve-earlier', approve.error);
  } else {
    pass('approve-earlier', 'ok');
  }

  const [vrAfterApprove] = await db
    .select({
      vacatingDate: vacatingRequests.vacatingDate,
      originalVacatingDate: vacatingRequests.originalVacatingDate,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
    })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, row.vacating_id));

  if (String(vrAfterApprove?.vacatingDate) === earlierDate) {
    pass('after-approve-stay', earlierDate);
  } else {
    fail('after-approve-stay', String(vrAfterApprove?.vacatingDate));
  }
  if (String(vrAfterApprove?.noticeGivenDate) === row.notice_given_date) {
    pass('original-notice-immutable', row.notice_given_date);
  } else {
    fail('original-notice-immutable', String(vrAfterApprove?.noticeGivenDate));
  }
  if (String(vrAfterApprove?.originalVacatingDate) === row.original_vacating_date) {
    pass('original-vacating-immutable', String(vrAfterApprove?.originalVacatingDate));
  } else {
    info('original-vacating', String(vrAfterApprove?.originalVacatingDate));
  }

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

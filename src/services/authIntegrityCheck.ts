/**
 * Resident authentication integrity detector — duplicate/orphan identity rows.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { collectSplitIdentityClusterIds } from '@/src/lib/auth/customerIdentityMerge';

export const AUTH_INTEGRITY_CHECK_TYPES = [
  'DUPLICATE_PHONE',
  'DUPLICATE_EMAIL',
  'PHONE_EMAIL_SPLIT',
  'ORPHAN_INCOMPLETE_WITH_BOOKING',
  'BOOKING_WITHOUT_CUSTOMER',
  'INCOMPLETE_WITH_PASSWORD',
  'SIGNUP_SESSION_CONFLICT',
  'PHONE_LOOKUP_EMAIL_MISMATCH',
  'ORPHAN_KYC',
  'ORPHAN_WALLET',
] as const;

export type AuthIntegrityCheckType = (typeof AUTH_INTEGRITY_CHECK_TYPES)[number];

export type AuthIntegrityIssue = {
  checkType: AuthIntegrityCheckType;
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  bookingId?: string | null;
  bookingCode?: string | null;
  relatedCustomerId?: string | null;
  detail: string;
  metadata?: Record<string, unknown>;
  autoRepairable: boolean;
};

export type AuthIntegrityAuditReport = {
  asOf: string;
  issues: AuthIntegrityIssue[];
  summary: {
    issueCount: number;
    byCheckType: Record<AuthIntegrityCheckType, number>;
    autoRepairableCount: number;
  };
};

function emptyByCheckType(): Record<AuthIntegrityCheckType, number> {
  return {
    DUPLICATE_PHONE: 0,
    DUPLICATE_EMAIL: 0,
    PHONE_EMAIL_SPLIT: 0,
    ORPHAN_INCOMPLETE_WITH_BOOKING: 0,
    BOOKING_WITHOUT_CUSTOMER: 0,
    INCOMPLETE_WITH_PASSWORD: 0,
    SIGNUP_SESSION_CONFLICT: 0,
    PHONE_LOOKUP_EMAIL_MISMATCH: 0,
    ORPHAN_KYC: 0,
    ORPHAN_WALLET: 0,
  };
}

async function checkDuplicatePhones(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    phone: string;
    cnt: number;
    customer_ids: string[];
    names: string[];
    emails: string[];
  }>(sql`
    SELECT phone, count(*)::int AS cnt,
           array_agg(id ORDER BY created_at) AS customer_ids,
           array_agg(full_name ORDER BY created_at) AS names,
           array_agg(email ORDER BY created_at) AS emails
    FROM customers
    WHERE archived_at IS NULL AND phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING count(*) > 1
  `);

  const issues: AuthIntegrityIssue[] = [];
  for (const row of rows) {
    issues.push({
      checkType: 'DUPLICATE_PHONE',
      customerId: row.customer_ids[0] ?? '',
      customerName: row.names.join(' / '),
      email: row.emails.join(' / '),
      phone: row.phone,
      relatedCustomerId: row.customer_ids[1],
      detail: `Phone ${row.phone} on ${row.cnt} active customers`,
      metadata: { customerIds: row.customer_ids },
      autoRepairable: true,
    });
  }
  return issues;
}

async function checkDuplicateEmails(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    email: string;
    cnt: number;
    customer_ids: string[];
    names: string[];
    phones: string[];
  }>(sql`
    SELECT email, count(*)::int AS cnt,
           array_agg(id ORDER BY created_at) AS customer_ids,
           array_agg(full_name ORDER BY created_at) AS names,
           array_agg(phone ORDER BY created_at) AS phones
    FROM customers
    WHERE archived_at IS NULL
    GROUP BY email
    HAVING count(*) > 1
  `);

  const issues: AuthIntegrityIssue[] = [];
  for (const row of rows) {
    issues.push({
      checkType: 'DUPLICATE_EMAIL',
      customerId: row.customer_ids[0] ?? '',
      customerName: row.names.join(' / '),
      email: row.email,
      phone: row.phones.join(' / '),
      relatedCustomerId: row.customer_ids[1],
      detail: `Email ${row.email} on ${row.cnt} active customers`,
      metadata: { customerIds: row.customer_ids },
      autoRepairable: true,
    });
  }
  return issues;
}

async function checkOrphanIncompleteWithBooking(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    customer_id: string;
    full_name: string;
    email: string;
    phone: string;
    booking_id: string;
    booking_code: string;
    has_password: boolean;
  }>(sql`
    SELECT c.id AS customer_id, c.full_name, c.email, c.phone,
           bk.id AS booking_id, bk.booking_code,
           (c.password_hash IS NOT NULL) AS has_password
    FROM customers c
    INNER JOIN bookings bk ON bk.customer_id = c.id
    WHERE c.archived_at IS NULL
      AND (c.password_hash IS NULL OR c.must_set_password = true)
      AND bk.status IN ('confirmed', 'pending_approval', 'pending_payment')
  `);

  return rows.map((row) => ({
    checkType: 'ORPHAN_INCOMPLETE_WITH_BOOKING' as const,
    customerId: row.customer_id,
    customerName: row.full_name,
    email: row.email,
    phone: row.phone,
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    detail: `Booking ${row.booking_code} exists but auth account incomplete (password=${row.has_password})`,
    autoRepairable: false,
  }));
}

async function checkSignupSessionConflicts(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    session_id: string;
    session_email: string;
    session_phone: string;
    customer_id: string;
    customer_email: string;
    customer_phone: string;
    customer_name: string;
  }>(sql`
    SELECT ss.id AS session_id, ss.email AS session_email, ss.phone AS session_phone,
           c.id AS customer_id, c.email AS customer_email, c.phone AS customer_phone,
           c.full_name AS customer_name
    FROM signup_sessions ss
    INNER JOIN customers c ON c.phone = ss.phone AND c.email != ss.email
    WHERE ss.expires_at > now()
      AND c.archived_at IS NULL
      AND c.password_hash IS NOT NULL
  `);

  return rows.map((row) => ({
    checkType: 'SIGNUP_SESSION_CONFLICT' as const,
    customerId: row.customer_id,
    customerName: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone,
    detail: `Active signup session ${row.session_email} conflicts with account email ${row.customer_email} on same phone`,
    metadata: { sessionId: row.session_id, sessionEmail: row.session_email },
    autoRepairable: false,
  }));
}

async function checkPhoneLookupEmailMismatch(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    customer_id: string;
    full_name: string;
    email: string;
    phone: string;
    booking_count: number;
  }>(sql`
    SELECT c.id AS customer_id, c.full_name, c.email, c.phone,
           (SELECT count(*)::int FROM bookings bk WHERE bk.customer_id = c.id) AS booking_count
    FROM customers c
    WHERE c.archived_at IS NULL
      AND c.password_hash IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM customers c2
        WHERE c2.archived_at IS NULL
          AND c2.id != c.id
          AND (
            (c2.phone = c.phone AND c2.email != c.email)
            OR (c2.email = c.email AND c2.phone != c.phone)
          )
      )
  `);

  const issues: AuthIntegrityIssue[] = [];
  const seenClusters = new Set<string>();

  for (const row of rows) {
    const clusterIds = await collectSplitIdentityClusterIds(row.customer_id);
    const clusterKey = [...clusterIds].sort().join(',');
    if (seenClusters.has(clusterKey)) continue;
    seenClusters.add(clusterKey);

    issues.push({
      checkType: 'PHONE_LOOKUP_EMAIL_MISMATCH',
      customerId: clusterIds[0] ?? row.customer_id,
      customerName: row.full_name,
      email: row.email,
      phone: row.phone,
      relatedCustomerId: clusterIds[1] ?? null,
      detail: `Identity split — ${clusterIds.length} rows share phone/email cluster (${row.booking_count} bookings on this row)`,
      metadata: { customerIds: clusterIds, bookingCount: row.booking_count },
      autoRepairable: clusterIds.length >= 2,
    });
  }
  return issues;
}

async function checkBookingWithoutCustomer(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    customer_name: string | null;
    archived: boolean;
  }>(sql`
    SELECT bk.id AS booking_id, bk.booking_code, bk.customer_id,
           c.full_name AS customer_name,
           (c.archived_at IS NOT NULL) AS archived
    FROM bookings bk
    LEFT JOIN customers c ON c.id = bk.customer_id
    WHERE c.id IS NULL OR c.archived_at IS NOT NULL
  `);

  return rows.map((row) => ({
    checkType: 'BOOKING_WITHOUT_CUSTOMER' as const,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '—',
    email: null,
    phone: null,
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    detail: row.archived
      ? `Booking ${row.booking_code} points to archived customer`
      : `Booking ${row.booking_code} has no valid customer`,
    autoRepairable: false,
  }));
}

async function checkIncompleteWithPassword(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    customer_id: string;
    full_name: string;
    email: string;
    phone: string;
  }>(sql`
    SELECT id AS customer_id, full_name, email, phone
    FROM customers
    WHERE archived_at IS NULL
      AND password_hash IS NOT NULL
      AND must_set_password = true
  `);

  return rows.map((row) => ({
    checkType: 'INCOMPLETE_WITH_PASSWORD' as const,
    customerId: row.customer_id,
    customerName: row.full_name,
    email: row.email,
    phone: row.phone,
    detail: 'Password hash exists but must_set_password is still true',
    autoRepairable: true,
  }));
}

async function checkOrphanKyc(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    kyc_id: string;
    customer_id: string;
    customer_name: string | null;
  }>(sql`
    SELECT k.id AS kyc_id, k.customer_id, c.full_name AS customer_name
    FROM kyc_submissions k
    LEFT JOIN customers c ON c.id = k.customer_id
    WHERE c.id IS NULL OR c.archived_at IS NOT NULL
  `);

  return rows.map((row) => ({
    checkType: 'ORPHAN_KYC' as const,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '—',
    email: null,
    phone: null,
    detail: `KYC submission ${row.kyc_id} has no active customer`,
    metadata: { kycId: row.kyc_id },
    autoRepairable: false,
  }));
}

async function checkOrphanDepositLedger(): Promise<AuthIntegrityIssue[]> {
  const rows = await db.execute<{
    ledger_id: string;
    customer_id: string;
    booking_id: string;
    customer_name: string | null;
  }>(sql`
    SELECT dl.id AS ledger_id, dl.customer_id, dl.booking_id, c.full_name AS customer_name
    FROM deposit_ledger dl
    LEFT JOIN customers c ON c.id = dl.customer_id
    WHERE c.id IS NULL OR c.archived_at IS NOT NULL
  `);

  return rows.map((row) => ({
    checkType: 'ORPHAN_WALLET' as const,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '—',
    email: null,
    phone: null,
    bookingId: row.booking_id,
    detail: `Deposit ledger ${row.ledger_id} has no active customer`,
    metadata: { ledgerId: row.ledger_id },
    autoRepairable: false,
  }));
}

export async function runAuthIntegrityCheck(opts?: {
  phone?: string;
  email?: string;
  name?: string;
}): Promise<AuthIntegrityAuditReport> {
  const asOf = new Date().toISOString();

  const [
    duplicatePhones,
    duplicateEmails,
    orphanIncomplete,
    signupConflicts,
    phoneEmailMismatch,
    bookingWithoutCustomer,
    incompleteWithPassword,
    orphanKyc,
    orphanDepositLedger,
  ] = await Promise.all([
    checkDuplicatePhones(),
    checkDuplicateEmails(),
    checkOrphanIncompleteWithBooking(),
    checkSignupSessionConflicts(),
    checkPhoneLookupEmailMismatch(),
    checkBookingWithoutCustomer(),
    checkIncompleteWithPassword(),
    checkOrphanKyc(),
    checkOrphanDepositLedger(),
  ]);

  let issues = [
    ...duplicatePhones,
    ...duplicateEmails,
    ...orphanIncomplete,
    ...signupConflicts,
    ...phoneEmailMismatch,
    ...bookingWithoutCustomer,
    ...incompleteWithPassword,
    ...orphanKyc,
    ...orphanDepositLedger,
  ];

  if (opts?.phone) {
    const phone = opts.phone.replace(/\D/g, '');
    issues = issues.filter(
      (i) => i.phone?.includes(phone) || i.detail.includes(phone),
    );
  }
  if (opts?.email) {
    const email = opts.email.toLowerCase();
    issues = issues.filter(
      (i) => i.email?.toLowerCase().includes(email) || i.detail.toLowerCase().includes(email),
    );
  }
  if (opts?.name) {
    const name = opts.name.toLowerCase();
    issues = issues.filter((i) => i.customerName.toLowerCase().includes(name));
  }

  const byCheckType = emptyByCheckType();
  for (const issue of issues) {
    byCheckType[issue.checkType] += 1;
  }

  return {
    asOf,
    issues,
    summary: {
      issueCount: issues.length,
      byCheckType,
      autoRepairableCount: issues.filter((i) => i.autoRepairable).length,
    },
  };
}

export async function lookupResidentAuthProfile(input: {
  phone?: string;
  email?: string;
  name?: string;
}) {
  const clauses = [];
  if (input.phone) {
    clauses.push(sql`c.phone LIKE ${'%' + input.phone.replace(/\D/g, '').slice(-10)}`);
  }
  if (input.email) {
    clauses.push(sql`c.email ILIKE ${input.email}`);
  }
  if (input.name) {
    clauses.push(sql`c.full_name ILIKE ${'%' + input.name + '%'}`);
  }
  if (clauses.length === 0) return [];

  return db.execute(sql`
    SELECT c.id, c.full_name, c.email, c.phone,
           c.password_hash IS NOT NULL AS has_password,
           c.must_set_password,
           c.archived_at,
           c.residency_status,
           c.created_at,
           (SELECT count(*)::int FROM bookings bk WHERE bk.customer_id = c.id) AS booking_count,
           (SELECT bk.booking_code FROM bookings bk WHERE bk.customer_id = c.id ORDER BY bk.created_at DESC LIMIT 1) AS latest_booking_code
    FROM customers c
    WHERE ${sql.join(clauses, sql` OR `)}
    ORDER BY c.created_at
  `);
}

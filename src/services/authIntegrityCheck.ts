/**
 * Resident authentication integrity detector — duplicate/orphan identity rows.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export const AUTH_INTEGRITY_CHECK_TYPES = [
  'DUPLICATE_PHONE',
  'DUPLICATE_EMAIL',
  'PHONE_EMAIL_SPLIT',
  'ORPHAN_INCOMPLETE_WITH_BOOKING',
  'BOOKING_WITHOUT_CUSTOMER',
  'INCOMPLETE_WITH_PASSWORD',
  'SIGNUP_SESSION_CONFLICT',
  'PHONE_LOOKUP_EMAIL_MISMATCH',
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

  return rows.map((row) => ({
    checkType: 'PHONE_LOOKUP_EMAIL_MISMATCH' as const,
    customerId: row.customer_id,
    customerName: row.full_name,
    email: row.email,
    phone: row.phone,
    detail: `Identity split — phone and email may resolve to different customer rows (${row.booking_count} bookings)`,
    metadata: { bookingCount: row.booking_count },
    autoRepairable: true,
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
  ] = await Promise.all([
    checkDuplicatePhones(),
    checkDuplicateEmails(),
    checkOrphanIncompleteWithBooking(),
    checkSignupSessionConflicts(),
    checkPhoneLookupEmailMismatch(),
  ]);

  let issues = [
    ...duplicatePhones,
    ...duplicateEmails,
    ...orphanIncomplete,
    ...signupConflicts,
    ...phoneEmailMismatch,
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

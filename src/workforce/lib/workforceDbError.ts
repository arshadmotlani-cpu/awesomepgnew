import { extractPostgresError, formatPostgresError } from '@/src/lib/db/postgresError';

const SAFE_USER_ERRORS = new Set([
  'Email address is required.',
  'Password is required (min 6 characters) or passwordHash when login is enabled.',
  'An employee with this email already exists.',
  'An employee with this phone number already exists.',
  'Organization context is required to create an employee.',
  'Organization context is missing. Sign in again or contact support.',
  'Location context is missing. Select a location and try again.',
  'You must be signed in to add employees.',
  'Workforce Engine is not enabled.',
  'Employee not found.',
  'Tenant context is required when FYH_SAAS_TENANT is enabled',
  'Invalid or missing tenant context',
  'QR code must be an image file.',
  'QR code image must be under 800KB.',
]);

/** User-facing message for workforce employee create/update failures. */
export function sanitizeWorkforceEmployeeError(err: unknown): string {
  if (err instanceof Error && SAFE_USER_ERRORS.has(err.message)) {
    return err.message;
  }

  if (err instanceof Error && err.message.startsWith('Missing permission:')) {
    return 'You do not have permission to perform this action.';
  }

  if (err instanceof Error && err.message.includes('End time must be after start time')) {
    return err.message;
  }

  const pg = extractPostgresError(err);

  if (pg.code === '23505') {
    if (/wf_employees_org_email|email/i.test(pg.constraint ?? '') || /email/i.test(pg.detail ?? '')) {
      return 'An employee with this email already exists.';
    }
    if (/wf_employees_org_mobile|mobile|phone/i.test(pg.constraint ?? '') || /mobile/i.test(pg.detail ?? '')) {
      return 'An employee with this phone number already exists.';
    }
    return 'An employee with these details already exists.';
  }

  if (pg.code === '23502' || /Failed query:/i.test(pg.message)) {
    return 'Could not save this employee. Please try again or contact support.';
  }

  if (err instanceof Error && err.message && !/insert into|select |update |delete from/i.test(err.message)) {
    return err.message;
  }

  return 'Could not save this employee. Please try again.';
}

/** Log full PostgreSQL detail server-side without exposing it to the client. */
export function logWorkforceEmployeeDbError(context: string, err: unknown): void {
  console.error(`[workforce.employees] ${context}:`, formatPostgresError(err));
}

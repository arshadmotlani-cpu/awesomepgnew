import { extractPostgresError, formatPostgresError } from '@/src/lib/db/postgresError';

const GENERIC_CREATE_ERROR = 'Unable to create employee right now. Please try again.';

const SAFE_USER_ERRORS = new Set([
  'Email address is required.',
  'Password is required (min 6 characters) or passwordHash when login is enabled.',
  'Password must be at least 6 characters.',
  'An employee with this email already exists.',
  'An employee with this phone number already exists.',
  'An employee with these details already exists.',
  'Organization context is required to create an employee.',
  'Organization context is missing. Sign in again or contact support.',
  'Location context is missing. Select a location and try again.',
  'Your organization has no active location configured. Please configure a location before creating an employee.',
  'No staff location is configured. Please select or configure a location before creating an employee.',
  'You must be signed in to add employees.',
  'Workforce Engine is not enabled.',
  'Employee not found.',
  'Tenant context is required when FYH_SAAS_TENANT is enabled',
  'Invalid or missing tenant context',
  'QR code must be an image file.',
  'QR code must be a valid image file.',
  'QR code image must be under 800KB.',
  'QR code image is too large for inline storage. Use a smaller image or configure cloud storage.',
  'Account number must be 9–18 digits.',
  'IFSC must be 11 characters (e.g. HDFC0001234).',
  'UPI ID must look like name@bank.',
  'Salary must be zero or a positive amount.',
  'Threshold multiplier must be a positive number.',
  'Percentage must be between 0 and 100.',
  'At least one incentive rule is required.',
  'Invalid incentive rule values.',
  'Duplicate performance thresholds are not allowed.',
  'The first rule must start at zero (flat / base rate).',
  'Each incentive rule must have a percentage.',
  'Salary is required when using a salary multiplier threshold.',
  'Performance threshold must be zero or a positive amount.',
  'Service incentive requires at least one rule.',
  'Product incentive requires at least one rule.',
  'The salon owner cannot be deactivated.',
  'The salon owner identity cannot be removed.',
  'Missing employee',
]);

function looksLikeSensitiveDump(message: string): boolean {
  if (/Failed query:/i.test(message)) return true;
  if (/\binsert into\b/i.test(message)) return true;
  if (/\bdelete from\b/i.test(message)) return true;
  if (/\bupdate\s+[\w."]+\s+set\b/i.test(message)) return true;
  if (/\bselect\s+(?:\*|[\w."]+(?:\s*,\s*[\w."]+)*)\s+from\b/i.test(message)) return true;
  return /password_hash|aadhaar_number|pan_number|account_number|ifsc_code|upi_id|data:image\/|base64,|bound values|params:/i.test(
    message,
  );
}

function isSafeValidationMessage(message: string): boolean {
  if (SAFE_USER_ERRORS.has(message)) return true;
  if (message.startsWith('Missing permission:')) return true;
  if (/end time must be after start time/i.test(message)) return true;
  if (/start and end times are required/i.test(message)) return true;
  if (/^please select/i.test(message) && !/\bfrom\b/i.test(message)) return true;
  if (/^select (a |an )[a-z]/i.test(message) && !/\bfrom\b/i.test(message)) return true;
  return false;
}

/** User-facing message for workforce employee create/update failures. */
export function sanitizeWorkforceEmployeeError(
  err: unknown,
  kind: 'create' | 'update' = 'create',
): string {
  const generic =
    kind === 'update'
      ? 'Unable to save this employee right now. Please try again.'
      : GENERIC_CREATE_ERROR;
  const raw = err instanceof Error ? err.message : String(err);
  if (looksLikeSensitiveDump(raw)) {
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
    return generic;
  }

  if (isSafeValidationMessage(raw)) {
    if (raw.startsWith('Missing permission:')) {
      return 'You do not have permission to perform this action.';
    }
    return raw;
  }

  const pg = extractPostgresError(err);
  if (pg.code === '23505') {
    return 'An employee with these details already exists.';
  }

  return generic;
}

/** Log full PostgreSQL detail server-side without exposing it to the client. */
export function logWorkforceEmployeeDbError(context: string, err: unknown): void {
  console.error(`[workforce.employees] ${context}:`, formatPostgresError(err));
}

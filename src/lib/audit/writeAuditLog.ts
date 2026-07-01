import { auditLog, type NewAuditLog } from '@/src/db/schema/auditLog';
import { db } from '@/src/db/client';
import {
  extractPostgresError,
  formatPostgresError,
  type PostgresErrorDetails,
} from '@/src/lib/db/postgresError';

type AuditWriter = Pick<typeof db, 'insert'>;

export type WriteAuditLogInput = Omit<NewAuditLog, 'id' | 'createdAt' | 'diff'> & {
  diff: Record<string, unknown>;
};

export type WriteAuditLogResult =
  | { ok: true }
  | { ok: false; error: string; pg: PostgresErrorDetails };

/** JSONB-safe audit diff — bigint/undefined/NaN cannot break INSERT. */
export function sanitizeAuditDiff(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const sanitized = sanitizeAuditDiff(entry);
      return sanitized === undefined ? null : sanitized;
    });
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = sanitizeAuditDiff(nested);
    }
    return out;
  }
  return value;
}

export async function writeAuditLog(
  writer: AuditWriter,
  input: WriteAuditLogInput,
): Promise<WriteAuditLogResult> {
  try {
    await writer.insert(auditLog).values({
      ...input,
      diff: sanitizeAuditDiff(input.diff) as Record<string, unknown>,
    });
    return { ok: true };
  } catch (err) {
    const pg = extractPostgresError(err);
    const error = formatPostgresError(err);
    console.error('[audit-log] insert failed', {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      error,
      pg,
    });
    return { ok: false, error, pg };
  }
}

/**
 * Best-effort audit write — never throws. Financial mutations must not roll back
 * when audit logging fails.
 */
export async function writeAuditLogNonBlocking(
  writer: AuditWriter,
  input: WriteAuditLogInput,
): Promise<WriteAuditLogResult> {
  return writeAuditLog(writer, input);
}

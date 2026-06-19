/**
 * Production-first deposit crash investigation logging.
 * Exact tags required for Vercel log filtering — no fixes, only capture.
 */

import { findUnsafeFields, jsonSafe, type UnsafeField } from '@/src/lib/depositPageDebug';

export type DepositInvestigationContext = {
  bookingId: string;
  bookingCode?: string | null;
  customerId?: string | null;
  component?: string;
};

export type SerializationAudit = {
  jsonSerializable: boolean;
  jsonError: string | null;
  bigints: Array<{ path: string; value: string }>;
  undefinedPaths: string[];
  hasCircularReference: boolean;
  unsafeFields: UnsafeField[];
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

export function throwSite(error: unknown): { file: string | null; line: number | null } {
  if (!(error instanceof Error) || !error.stack) {
    return { file: null, line: null };
  }
  for (const frame of error.stack.split('\n').slice(1)) {
    const match =
      frame.match(/\((.+):(\d+):\d+\)/) ?? frame.match(/at (.+):(\d+):\d+/);
    if (match && !match[1].includes('depositInvestigation')) {
      return { file: match[1], line: Number(match[2]) };
    }
  }
  return { file: null, line: null };
}

function walkValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  out: {
    bigints: Array<{ path: string; value: string }>;
    undefinedPaths: string[];
    hasCircularReference: boolean;
  },
): void {
  if (value === undefined) {
    out.undefinedPaths.push(path);
    return;
  }
  if (value === null) return;
  if (typeof value === 'bigint') {
    out.bigints.push({ path, value: `${value}n` });
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) {
    out.hasCircularReference = true;
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkValue(item, `${path}[${i}]`, seen, out));
    return;
  }
  if (value instanceof Date) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walkValue(child, path === 'root' ? key : `${path}.${key}`, seen, out);
  }
}

export function auditSerialization(value: unknown): SerializationAudit {
  const walk = {
    bigints: [] as Array<{ path: string; value: string }>,
    undefinedPaths: [] as string[],
    hasCircularReference: false,
  };
  walkValue(value, 'root', new WeakSet(), walk);
  const unsafeFields = findUnsafeFields(value);
  let jsonSerializable = true;
  let jsonError: string | null = null;
  try {
    JSON.stringify(value);
  } catch (err) {
    jsonSerializable = false;
    jsonError = errorMessage(err);
  }
  return {
    jsonSerializable,
    jsonError,
    bigints: walk.bigints,
    undefinedPaths: walk.undefinedPaths,
    hasCircularReference: walk.hasCircularReference,
    unsafeFields,
  };
}

type LogPayload = Record<string, unknown>;

function basePayload(
  tag: string,
  ctx: DepositInvestigationContext,
  extra?: LogPayload,
): LogPayload {
  const site = extra?.error ? throwSite(extra.error) : { file: null, line: null };
  return jsonSafe({
    tag,
    bookingId: ctx.bookingId,
    bookingCode: ctx.bookingCode ?? null,
    customerId: ctx.customerId ?? null,
    component: ctx.component ?? null,
    file: extra?.file ?? site.file,
    line: extra?.line ?? site.line,
    stack: extra?.stack ?? (extra?.error ? errorStack(extra.error) : undefined),
    data: extra?.data ?? null,
    ...extra,
  });
}

function emit(tag: string, ctx: DepositInvestigationContext, extra?: LogPayload): void {
  console.error(tag, basePayload(tag, ctx, extra));
}

export function logDepositSaveStart(ctx: DepositInvestigationContext, data?: Record<string, unknown>) {
  emit('[DEPOSIT_SAVE_START]', ctx, { data: data ? jsonSafe(data) : null });
}

export function logDepositSaveAfterUpdate(ctx: DepositInvestigationContext, data?: Record<string, unknown>) {
  emit('[DEPOSIT_SAVE_AFTER_UPDATE]', ctx, { data: data ? jsonSafe(data) : null });
}

export function logDepositSaveAfterSync(ctx: DepositInvestigationContext, data?: Record<string, unknown>) {
  emit('[DEPOSIT_SAVE_AFTER_SYNC]', ctx, { data: data ? jsonSafe(data) : null });
}

export function logDepositSaveAfterRevalidate(ctx: DepositInvestigationContext, data?: Record<string, unknown>) {
  emit('[DEPOSIT_SAVE_AFTER_REVALIDATE]', ctx, { data: data ? jsonSafe(data) : null });
}

export function logDepositSaveFailed(
  ctx: DepositInvestigationContext,
  error: unknown,
  data?: Record<string, unknown>,
) {
  emit('[DEPOSIT_SAVE_START]', ctx, {
    phase: 'failed',
    error: errorMessage(error),
    stack: errorStack(error),
    data: data ? jsonSafe(data) : null,
  });
}

export function logDepositPageLoadStart(ctx: DepositInvestigationContext) {
  emit('[DEPOSIT_PAGE_LOAD_START]', ctx, {});
}

export function logDepositPageLoadSuccess(ctx: DepositInvestigationContext, data: Record<string, unknown>) {
  const audit = auditSerialization(data);
  emit('[DEPOSIT_PAGE_LOAD_SUCCESS]', ctx, {
    data: jsonSafe(data),
    serialization: audit,
    bigintReachClient: audit.bigints.length > 0,
  });
}

export function logDepositPageLoadFailed(
  ctx: DepositInvestigationContext,
  error: unknown,
  data?: Record<string, unknown>,
) {
  emit('[DEPOSIT_PAGE_LOAD_FAILED]', ctx, {
    error: errorMessage(error),
    stack: errorStack(error),
    data: data ? jsonSafe(data) : null,
  });
}

export function logDepositComponentRender(
  ctx: DepositInvestigationContext,
  data?: Record<string, unknown>,
) {
  const audit = data ? auditSerialization(data) : null;
  emit('[DEPOSIT_COMPONENT_RENDER]', ctx, {
    data: data ? jsonSafe(data) : null,
    serialization: audit,
    bigintInProps: audit?.bigints ?? [],
  });
  if (audit && audit.bigints.length > 0) {
    console.error(
      '[DEPOSIT_COMPONENT_FAILED]',
      basePayload('[DEPOSIT_COMPONENT_FAILED]', ctx, {
        phase: 'bigint_in_props',
        error: `BigInt in props: ${audit.bigints.map((b) => b.path).join(', ')}`,
        data: jsonSafe(data),
      }),
    );
  }
}

export function logDepositComponentFailed(
  ctx: DepositInvestigationContext,
  error: unknown,
  data?: Record<string, unknown>,
) {
  const site = throwSite(error);
  emit('[DEPOSIT_COMPONENT_FAILED]', ctx, {
    error: errorMessage(error),
    stack: errorStack(error),
    file: site.file,
    line: site.line,
    data: data ? jsonSafe(data) : null,
  });
}

export function logDepositServerActionCaught(
  action: string,
  bookingId: string,
  err: unknown,
  extra?: Record<string, unknown>,
) {
  emit('[DEPOSIT_COMPONENT_FAILED]', { bookingId, component: action }, {
    phase: 'server_action_caught',
    action,
    error: errorMessage(err),
    stack: errorStack(err),
    ...extra,
  });
}

export function auditBigIntFields(value: unknown, label: string, ctx: DepositInvestigationContext) {
  const audit = auditSerialization(value);
  if (audit.bigints.length > 0 || audit.unsafeFields.length > 0) {
    console.error(
      '[DEPOSIT_COMPONENT_FAILED]',
      basePayload('[DEPOSIT_COMPONENT_FAILED]', ctx, {
        phase: 'bigint_audit',
        label,
        bigints: audit.bigints,
        unsafeFields: audit.unsafeFields,
        data: jsonSafe({ label, audit }),
      }),
    );
  }
  return audit;
}

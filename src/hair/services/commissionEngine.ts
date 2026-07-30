import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { hairDb } from '@/src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhCommissionRules,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhServices,
  fyhStaff,
  type FyhAttributionRole,
  type FyhCommissionRule,
  type FyhCommissionRuleConfig,
  type FyhCommissionRuleScope,
  type FyhCommissionType,
  type FyhInvoiceLineKind,
} from '@/src/hair/db/schema';

type Db = typeof hairDb;

type AttributionRow = {
  invoiceLineId: string;
  staffId: string;
  role: FyhAttributionRole;
  shareBps: number;
  attributedNetPaise: number;
  revenueMetric: string;
  kind: FyhInvoiceLineKind;
  serviceId: string | null;
  productId: string | null;
  packageId: string | null;
  membershipId: string | null;
  unitPricePaise: number;
};

function scopeForKind(kind: FyhInvoiceLineKind): FyhCommissionRuleScope | null {
  if (kind === 'service') return 'service';
  if (kind === 'product') return 'product';
  if (kind === 'package') return 'package';
  if (kind === 'membership') return 'membership';
  return null;
}

function scopeRefForLine(row: AttributionRow): string | null {
  if (row.kind === 'service') return row.serviceId;
  if (row.kind === 'product') return row.productId;
  if (row.kind === 'package') return row.packageId;
  if (row.kind === 'membership') return row.membershipId;
  return null;
}

/** Scale a line-level fixed amount by attribution share. */
export function scaleFixedByShare(amountPaise: number, shareBps: number): number {
  return Math.round((amountPaise * shareBps) / 10_000);
}

/** Percent commission on attributed net (share already baked into attributedNetPaise). */
export function percentOnAttributed(attributedNetPaise: number, percentBps: number): number {
  return Math.round((attributedNetPaise * percentBps) / 10_000);
}

export function computeFromRuleConfig(
  config: FyhCommissionRuleConfig,
  attributedNetPaise: number,
  shareBps: number,
  role: FyhAttributionRole,
): number {
  switch (config.kind) {
    case 'flat_percent':
      return percentOnAttributed(attributedNetPaise, config.percentBps);
    case 'flat_amount':
      return scaleFixedByShare(config.amountPaise, shareBps);
    case 'tiered_percent': {
      const tier = [...config.tiers]
        .sort((a, b) => b.minNetPaise - a.minNetPaise)
        .find((t) => attributedNetPaise >= t.minNetPaise);
      return tier ? percentOnAttributed(attributedNetPaise, tier.percentBps) : 0;
    }
    case 'fixed_bonus':
      if (config.minNetPaise != null && attributedNetPaise < config.minNetPaise) return 0;
      return scaleFixedByShare(config.amountPaise, shareBps);
    case 'role_based':
      if (config.role !== role) return 0;
      if (config.percentBps != null) return percentOnAttributed(attributedNetPaise, config.percentBps);
      if (config.amountPaise != null) return scaleFixedByShare(config.amountPaise, shareBps);
      return 0;
    default:
      return 0;
  }
}

function computeFromStaffOrServiceDefaults(input: {
  commissionType: FyhCommissionType;
  fixedPaise: number;
  percentBps: number;
  attributedNetPaise: number;
  shareBps: number;
}): number {
  if (input.commissionType === 'fixed') {
    return scaleFixedByShare(input.fixedPaise, input.shareBps);
  }
  if (input.commissionType === 'percentage') {
    return percentOnAttributed(input.attributedNetPaise, input.percentBps);
  }
  return 0;
}

async function pickCommissionRule(
  db: Db,
  row: AttributionRow,
  staffRole: string | null,
  paidAt: Date,
): Promise<FyhCommissionRule | null> {
  const scope = scopeForKind(row.kind);
  if (!scope) return null;
  const scopeRef = scopeRefForLine(row);

  const rules = await db
    .select()
    .from(fyhCommissionRules)
    .where(
      and(
        eq(fyhCommissionRules.isActive, true),
        or(eq(fyhCommissionRules.scope, scope), eq(fyhCommissionRules.scope, 'global')),
        or(isNull(fyhCommissionRules.effectiveFrom), lte(fyhCommissionRules.effectiveFrom, paidAt)),
        or(isNull(fyhCommissionRules.effectiveTo), gte(fyhCommissionRules.effectiveTo, paidAt)),
        or(
          isNull(fyhCommissionRules.staffRole),
          staffRole ? eq(fyhCommissionRules.staffRole, staffRole) : isNull(fyhCommissionRules.staffRole),
        ),
      ),
    )
    .orderBy(fyhCommissionRules.priority);

  for (const rule of rules) {
    if (rule.scope === 'global') return rule;
    if (rule.scopeRefId && rule.scopeRefId !== scopeRef) continue;
    return rule;
  }
  return null;
}

async function resolveCommissionPaise(
  db: Db,
  row: AttributionRow,
  staff: typeof fyhStaff.$inferSelect,
  paidAt: Date,
): Promise<number> {
  const rule = await pickCommissionRule(db, row, staff.role, paidAt);
  if (rule?.config && typeof rule.config === 'object' && 'kind' in rule.config) {
    return computeFromRuleConfig(
      rule.config as FyhCommissionRuleConfig,
      row.attributedNetPaise,
      row.shareBps,
      row.role,
    );
  }

  if (row.kind === 'service' && row.serviceId) {
    const [service] = await db
      .select()
      .from(fyhServices)
      .where(eq(fyhServices.id, row.serviceId))
      .limit(1);
    if (service?.overrideStaffCommission) {
      return computeFromStaffOrServiceDefaults({
        commissionType: service.commissionType,
        fixedPaise: service.commissionFixedPaise,
        percentBps: service.commissionPercentBps,
        attributedNetPaise: row.attributedNetPaise,
        shareBps: row.shareBps,
      });
    }
  }

  return computeFromStaffOrServiceDefaults({
    commissionType: staff.defaultCommissionType,
    fixedPaise: staff.defaultCommissionFixedPaise,
    percentBps: staff.defaultCommissionPercentBps,
    attributedNetPaise: row.attributedNetPaise,
    shareBps: row.shareBps,
  });
}

/**
 * Post-checkout commission job — reads fyh_invoice_line_attributions and writes fyh_commission_entries.
 * Skips lines that already have commission rows (idempotent on re-run).
 */
export async function evaluateCommissionsForInvoice(db: Db, invoiceId: string): Promise<void> {
  const [invoice] = await db.select().from(fyhInvoices).where(eq(fyhInvoices.id, invoiceId)).limit(1);
  if (!invoice?.paidAt) return;

  const periodDate = invoice.paidAt.toISOString().slice(0, 10);

  const rows = await db
    .select({
      invoiceLineId: fyhInvoiceLineAttributions.invoiceLineId,
      staffId: fyhInvoiceLineAttributions.staffId,
      role: fyhInvoiceLineAttributions.role,
      shareBps: fyhInvoiceLineAttributions.shareBps,
      attributedNetPaise: fyhInvoiceLineAttributions.attributedNetPaise,
      revenueMetric: fyhInvoiceLineAttributions.revenueMetric,
      kind: fyhInvoiceLines.kind,
      serviceId: fyhInvoiceLines.serviceId,
      productId: fyhInvoiceLines.productId,
      packageId: fyhInvoiceLines.packageId,
      membershipId: fyhInvoiceLines.membershipId,
      unitPricePaise: fyhInvoiceLines.unitPricePaise,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .where(eq(fyhInvoiceLines.invoiceId, invoiceId));

  if (!rows.length) return;

  const lineIds = [...new Set(rows.map((r) => r.invoiceLineId))];
  const existing = await db
    .select({
      invoiceLineId: fyhCommissionEntries.invoiceLineId,
      staffId: fyhCommissionEntries.staffId,
    })
    .from(fyhCommissionEntries)
    .where(inArray(fyhCommissionEntries.invoiceLineId, lineIds));
  const existingKeys = new Set(existing.map((e) => `${e.invoiceLineId}:${e.staffId}`));

  const staffCache = new Map<string, typeof fyhStaff.$inferSelect>();
  const toInsert: Array<typeof fyhCommissionEntries.$inferInsert> = [];

  for (const row of rows) {
    if (existingKeys.has(`${row.invoiceLineId}:${row.staffId}`)) continue;

    let staff = staffCache.get(row.staffId);
    if (!staff) {
      const [loaded] = await db.select().from(fyhStaff).where(eq(fyhStaff.id, row.staffId)).limit(1);
      if (!loaded) continue;
      staff = loaded;
      staffCache.set(row.staffId, staff);
    }

    const amountPaise = await resolveCommissionPaise(db, row, staff, invoice.paidAt);
    if (amountPaise <= 0) continue;

    toInsert.push({
      invoiceLineId: row.invoiceLineId,
      staffId: row.staffId,
      amountPaise,
      status: 'pending',
      periodDate,
    });
  }

  if (toInsert.length) {
    await db.insert(fyhCommissionEntries).values(toInsert);
  }
}

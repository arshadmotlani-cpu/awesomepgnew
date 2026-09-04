/**
 * One-time org-scoped FYH product catalog cleanup helpers.
 * Used by audit/cleanup scripts only — not a product API.
 */
import { sql } from 'drizzle-orm';
import type { createHairClient } from '@/src/hair/db/client';

export type HairDb = ReturnType<typeof createHairClient>['db'];

export type ProductAuditRow = {
  id: string;
  name: string;
  brandName: string;
  isActive: boolean;
  stockQty: number;
  productType: string;
  invoiceLines: number;
  stockMovements: number;
  purchaseLines: number;
  purchaseOrderLines: number;
  goodsReceiptLines: number;
  purchaseReturnLines: number;
  serviceConsumables: number;
  stockAdjustments: number;
  floorIssues: number;
  productBatches: number;
  locationStock: number;
  proposedAction: 'DELETE' | 'ARCHIVE';
  blockers: string[];
};

export type OrgSummary = {
  organizationId: string;
  businessName: string | null;
  productCount: number;
  activeProductCount: number;
};

export async function resolveFyhProductionOrganizationId(
  db: HairDb,
  organizationIdArg?: string,
): Promise<OrgSummary> {
  if (organizationIdArg?.trim()) {
    const [row] = await db.execute<{
      organization_id: string;
      business_name: string | null;
      product_count: number;
      active_count: number;
    }>(sql`
      SELECT
        s.organization_id,
        s.business_name,
        (SELECT count(*)::int FROM fyh_products p WHERE p.organization_id = s.organization_id) AS product_count,
        (SELECT count(*)::int FROM fyh_products p WHERE p.organization_id = s.organization_id AND p.is_active = true) AS active_count
      FROM fyh_settings s
      WHERE s.organization_id = ${organizationIdArg.trim()}::uuid
      LIMIT 1
    `);
    if (!row) {
      throw new Error(`No fyh_settings row for organization_id ${organizationIdArg}`);
    }
    return {
      organizationId: row.organization_id,
      businessName: row.business_name,
      productCount: Number(row.product_count),
      activeProductCount: Number(row.active_count),
    };
  }

  const [defaultOrg] = await db.execute<{ org_id: string }>(sql`
    SELECT fyh_default_organization_id() AS org_id
  `);
  const orgId = defaultOrg?.org_id;
  if (!orgId) throw new Error('Could not resolve fyh_default_organization_id()');

  const [row] = await db.execute<{
    organization_id: string;
    business_name: string | null;
    product_count: number;
    active_count: number;
  }>(sql`
    SELECT
      s.organization_id,
      s.business_name,
      (SELECT count(*)::int FROM fyh_products p WHERE p.organization_id = s.organization_id) AS product_count,
      (SELECT count(*)::int FROM fyh_products p WHERE p.organization_id = s.organization_id AND p.is_active = true) AS active_count
    FROM fyh_settings s
    WHERE s.organization_id = ${orgId}::uuid
    LIMIT 1
  `);

  return {
    organizationId: row?.organization_id ?? orgId,
    businessName: row?.business_name ?? null,
    productCount: Number(row?.product_count ?? 0),
    activeProductCount: Number(row?.active_count ?? 0),
  };
}

export async function auditFyhProductsForOrganization(
  db: HairDb,
  organizationId: string,
): Promise<ProductAuditRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    brand_name: string;
    is_active: boolean;
    stock_qty: string;
    product_type: string;
    invoice_lines: number;
    stock_movements: number;
    purchase_lines: number;
    purchase_order_lines: number;
    goods_receipt_lines: number;
    purchase_return_lines: number;
    service_consumables: number;
    stock_adjustments: number;
    floor_issues: number;
    product_batches: number;
    location_stock: number;
  }>(sql`
    SELECT
      p.id,
      p.name,
      b.name AS brand_name,
      p.is_active,
      p.stock_qty::text,
      p.product_type,
      (SELECT count(*)::int FROM fyh_invoice_lines il WHERE il.product_id = p.id) AS invoice_lines,
      (SELECT count(*)::int FROM fyh_stock_movements m WHERE m.product_id = p.id) AS stock_movements,
      (SELECT count(*)::int FROM fyh_purchase_lines pl WHERE pl.product_id = p.id) AS purchase_lines,
      (SELECT count(*)::int FROM fyh_purchase_order_lines pol WHERE pol.product_id = p.id) AS purchase_order_lines,
      (SELECT count(*)::int FROM fyh_goods_receipt_lines gl WHERE gl.product_id = p.id) AS goods_receipt_lines,
      (SELECT count(*)::int FROM fyh_purchase_return_lines prl WHERE prl.product_id = p.id) AS purchase_return_lines,
      (SELECT count(*)::int FROM fyh_service_consumables sc WHERE sc.product_id = p.id) AS service_consumables,
      (SELECT count(*)::int FROM fyh_stock_adjustments sa WHERE sa.product_id = p.id) AS stock_adjustments,
      (SELECT count(*)::int FROM fyh_floor_issues fi WHERE fi.product_id = p.id) AS floor_issues,
      (SELECT count(*)::int FROM fyh_product_batches pb WHERE pb.product_id = p.id) AS product_batches,
      (SELECT count(*)::int FROM fyh_location_stock ls WHERE ls.product_id = p.id) AS location_stock
    FROM fyh_products p
    INNER JOIN fyh_brands b ON b.id = p.brand_id
    WHERE p.organization_id = ${organizationId}::uuid
    ORDER BY p.name ASC
  `);

  return rows.map((r) => {
    const blockers: string[] = [];
    if (Number(r.purchase_lines) > 0) blockers.push('purchase_lines');
    if (Number(r.purchase_order_lines) > 0) blockers.push('purchase_order_lines');
    if (Number(r.goods_receipt_lines) > 0) blockers.push('goods_receipt_lines');
    if (Number(r.purchase_return_lines) > 0) blockers.push('purchase_return_lines');
    if (Number(r.service_consumables) > 0) blockers.push('service_consumables');

    const proposedAction: 'DELETE' | 'ARCHIVE' =
      blockers.length > 0 ? 'ARCHIVE' : 'DELETE';

    return {
      id: r.id,
      name: r.name,
      brandName: r.brand_name,
      isActive: r.is_active,
      stockQty: Number(r.stock_qty),
      productType: r.product_type,
      invoiceLines: Number(r.invoice_lines),
      stockMovements: Number(r.stock_movements),
      purchaseLines: Number(r.purchase_lines),
      purchaseOrderLines: Number(r.purchase_order_lines),
      goodsReceiptLines: Number(r.goods_receipt_lines),
      purchaseReturnLines: Number(r.purchase_return_lines),
      serviceConsumables: Number(r.service_consumables),
      stockAdjustments: Number(r.stock_adjustments),
      floorIssues: Number(r.floor_issues),
      productBatches: Number(r.product_batches),
      locationStock: Number(r.location_stock),
      proposedAction,
      blockers,
    };
  });
}

export type CleanupResult = {
  archived: number;
  deleted: number;
  clearedStockMovements: number;
  errors: string[];
};

export async function cleanupFyhProductCatalogForOrganization(
  db: HairDb,
  organizationId: string,
  { dryRun = true }: { dryRun?: boolean } = {},
): Promise<CleanupResult> {
  const audit = await auditFyhProductsForOrganization(db, organizationId);
  const result: CleanupResult = {
    archived: 0,
    deleted: 0,
    clearedStockMovements: 0,
    errors: [],
  };

  const toArchive = audit.filter((p) => p.proposedAction === 'ARCHIVE');
  const toDelete = audit.filter((p) => p.proposedAction === 'DELETE');

  if (dryRun) {
    result.archived = toArchive.length;
    result.deleted = toDelete.length;
    result.clearedStockMovements = toDelete.reduce((s, p) => s + p.stockMovements, 0);
    return result;
  }

  for (const product of toArchive) {
    try {
      await db.execute(sql`
        UPDATE fyh_products
        SET is_active = false, archived_at = NOW(), updated_at = NOW()
        WHERE id = ${product.id}::uuid AND organization_id = ${organizationId}::uuid
      `);
      result.archived += 1;
    } catch (err) {
      result.errors.push(`${product.name}: archive failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (toDelete.length > 0) {
    const ids = toDelete.map((p) => p.id);
    const idList = sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    );

    const movementResult = await db.execute(sql`
      DELETE FROM fyh_stock_movements
      WHERE product_id IN (${idList}) AND organization_id = ${organizationId}::uuid
      RETURNING id
    `);
    result.clearedStockMovements = Array.isArray(movementResult) ? movementResult.length : 0;

    await db.execute(sql`DELETE FROM fyh_stock_adjustments WHERE product_id IN (${idList})`);
    await db.execute(sql`DELETE FROM fyh_floor_issues WHERE product_id IN (${idList})`);
    await db.execute(sql`DELETE FROM fyh_product_batches WHERE product_id IN (${idList})`);
    await db.execute(sql`DELETE FROM fyh_location_stock WHERE product_id IN (${idList})`);

    const deleted = await db.execute(sql`
      DELETE FROM fyh_products
      WHERE id IN (${idList}) AND organization_id = ${organizationId}::uuid
      RETURNING id
    `);
    result.deleted = Array.isArray(deleted) ? deleted.length : 0;
  }

  return result;
}

export async function countActiveProducts(db: HairDb, organizationId: string): Promise<number> {
  const [row] = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM fyh_products
    WHERE organization_id = ${organizationId}::uuid AND is_active = true
  `);
  return Number(row?.c ?? 0);
}

export async function countRelatedEntities(db: HairDb, organizationId: string) {
  const [row] = await db.execute<{
    services: number;
    packages: number;
    memberships: number;
    customers: number;
    invoices: number;
    purchases: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM fyh_services WHERE organization_id = ${organizationId}::uuid) AS services,
      (SELECT count(*)::int FROM fyh_package_plans WHERE organization_id = ${organizationId}::uuid) AS packages,
      (SELECT count(*)::int FROM fyh_membership_plans WHERE organization_id = ${organizationId}::uuid) AS memberships,
      (SELECT count(*)::int FROM fyh_customers WHERE organization_id = ${organizationId}::uuid) AS customers,
      (SELECT count(*)::int FROM fyh_invoices WHERE organization_id = ${organizationId}::uuid) AS invoices,
      (SELECT count(*)::int FROM fyh_purchases WHERE organization_id = ${organizationId}::uuid) AS purchases
  `);
  return row;
}

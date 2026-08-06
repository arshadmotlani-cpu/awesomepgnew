import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  FYH_COMMISSION_TYPES,
  FYH_SERVICE_CATEGORY_PRESETS,
  fyhProducts,
  fyhServiceCategories,
  fyhServiceConsumables,
  fyhServices,
  fyhServiceStaff,
  fyhStaff,
  type FyhCommissionType,
} from '@/src/hair/db/schema';
import { resolveConsumableDeductInventory } from '@/src/hair/lib/consumableDeduction';
import {
  canonicalServiceName,
  normalizeServiceName,
} from '@/src/hair/lib/serviceName';
import {
  shouldHideServiceFromBillable,
  shouldHideServiceFromCatalog,
} from '@/src/hair/lib/serviceCatalogHygiene';

function toPaise(rupees: number): number {
  return Math.round(Number(rupees || 0) * 100);
}

function toBps(percent: number): number {
  return Math.round(Number(percent || 0) * 100);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

async function nextServiceCode(): Promise<string> {
  const result = await hairDb.execute(
    sql`SELECT nextval('fyh_service_code_seq')::text AS n`,
  );
  const row = (result as unknown as Array<{ n: string }>)[0];
  const n = Number(row?.n ?? 1);
  return `SVC-${String(n).padStart(4, '0')}`;
}

/** Thrown when normalized service name matches an existing row. */
export class DuplicateServiceError extends Error {
  readonly code = 'DUPLICATE_SERVICE' as const;

  constructor(public existingId: string) {
    super('This service already exists.');
    this.name = 'DuplicateServiceError';
  }
}

async function findServiceByNormalizedName(name: string, excludeId?: string) {
  const target = normalizeServiceName(name);
  const rows = await hairDb
    .select({ id: fyhServices.id, name: fyhServices.name })
    .from(fyhServices);
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (normalizeServiceName(row.name) === target) return row;
  }
  return null;
}

async function assertUniqueServiceName(name: string, excludeId?: string) {
  const dup = await findServiceByNormalizedName(name, excludeId);
  if (dup) throw new DuplicateServiceError(dup.id);
}

/** Salon catalog GST (18%). Future: read fyh_settings.defaultGstBps globally. */
const SALON_GST_BPS = 1800;

export type ServiceInput = {
  name: string;
  category?: string | null;
  durationMinutes: number;
  sellingPriceRupees: number;
  costPriceRupees: number;
  description?: string | null;
  isActive?: boolean;
  /** Programmatic / seed / tests only — not from service form */
  gstPercent?: number;
  commissionType?: FyhCommissionType;
  commissionFixedRupees?: number;
  commissionPercent?: number;
  overrideStaffCommission?: boolean;
  availableOnline?: boolean;
  featured?: boolean;
  showOnWebsite?: boolean;
  staffIds?: string[];
  consumables?: Array<{ productId: string; quantity: number; deductInventory?: boolean }>;
};

export type ServiceListFilters = {
  q?: string;
  status?: 'active' | 'inactive' | 'all';
  category?: string;
};

export async function listServiceCategories() {
  return hairDb
    .select()
    .from(fyhServiceCategories)
    .orderBy(asc(fyhServiceCategories.displayOrder), asc(fyhServiceCategories.name));
}

export async function ensureCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed) || `cat-${Date.now()}`;
  const [existing] = await hairDb
    .select()
    .from(fyhServiceCategories)
    .where(or(eq(fyhServiceCategories.name, trimmed), eq(fyhServiceCategories.slug, slug)))
    .limit(1);
  if (existing) return existing;
  const [row] = await hairDb
    .insert(fyhServiceCategories)
    .values({ name: trimmed, slug, isSystem: false, displayOrder: 200 })
    .returning();
  return row;
}

export async function listActiveStaff() {
  return hairDb
    .select()
    .from(fyhStaff)
    .where(eq(fyhStaff.isActive, true))
    .orderBy(asc(fyhStaff.fullName));
}

export async function listServices(filters: ServiceListFilters = {}) {
  const conditions = [];
  const status = filters.status ?? 'active';
  if (status === 'active') conditions.push(eq(fyhServices.isActive, true));
  if (status === 'inactive') conditions.push(eq(fyhServices.isActive, false));
  if (filters.category?.trim()) {
    conditions.push(eq(fyhServices.category, filters.category.trim()));
  }
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    const searchParts = [
      ilike(fyhServices.name, pattern),
      ilike(fyhServices.category, pattern),
    ];
    const num = Number(q.replace(/[^\d.]/g, ''));
    if (!Number.isNaN(num) && /\d/.test(q)) {
      const paise = Math.round(num * 100);
      searchParts.push(eq(fyhServices.pricePaise, paise));
    }
    conditions.push(or(...searchParts)!);
  }
  return hairDb
    .select({ service: fyhServices })
    .from(fyhServices)
    .leftJoin(fyhServiceCategories, eq(fyhServices.category, fyhServiceCategories.name))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      asc(sql`coalesce(${fyhServiceCategories.displayOrder}, 999)`),
      asc(fyhServices.name),
    )
    .limit(300)
    .then((rows) =>
      rows
        .map((r) => r.service)
        .filter((s) => !shouldHideServiceFromCatalog(s.name, s.code))
        .filter((s) => (status === 'active' ? s.isActive : status === 'inactive' ? !s.isActive : true)),
    );
}

export async function getService(id: string) {
  const [row] = await hairDb.select().from(fyhServices).where(eq(fyhServices.id, id)).limit(1);
  return row ?? null;
}

export async function getServiceStaffIds(serviceId: string): Promise<string[]> {
  const rows = await hairDb
    .select({ staffId: fyhServiceStaff.staffId })
    .from(fyhServiceStaff)
    .where(eq(fyhServiceStaff.serviceId, serviceId));
  return rows.map((r) => r.staffId);
}

export async function getServiceConsumables(serviceId: string) {
  return hairDb
    .select()
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, serviceId));
}

export async function getServiceDetail(id: string) {
  const service = await getService(id);
  if (!service) return null;
  const [staffIds, consumables] = await Promise.all([
    getServiceStaffIds(id),
    getServiceConsumables(id),
  ]);
  return { service, staffIds, consumables };
}

async function resolveCategory(input: ServiceInput): Promise<string> {
  const name = input.category?.trim();
  if (!name) throw new Error('Category is required');
  if (!(FYH_SERVICE_CATEGORY_PRESETS as readonly string[]).includes(name)) {
    throw new Error('Choose a category from the salon catalog');
  }
  return name;
}

function commissionFields(input: ServiceInput) {
  const commissionType = (input.commissionType ?? 'none') as FyhCommissionType;
  if (!(FYH_COMMISSION_TYPES as readonly string[]).includes(commissionType)) {
    throw new Error('Invalid commission type');
  }
  return {
    commissionType,
    commissionFixedPaise: toPaise(input.commissionFixedRupees ?? 0),
    commissionPercentBps: toBps(input.commissionPercent ?? 0),
    overrideStaffCommission: Boolean(input.overrideStaffCommission),
  };
}

async function syncStaff(serviceId: string, staffIds: string[] | undefined) {
  if (staffIds === undefined) return;
  await hairDb.delete(fyhServiceStaff).where(eq(fyhServiceStaff.serviceId, serviceId));
  const unique = [...new Set((staffIds ?? []).filter(Boolean))];
  if (!unique.length) return;
  await hairDb.insert(fyhServiceStaff).values(
    unique.map((staffId) => ({ serviceId, staffId })),
  );
}

async function syncConsumables(
  serviceId: string,
  consumables: ServiceInput['consumables'],
) {
  const existing = await hairDb
    .select({
      productId: fyhServiceConsumables.productId,
      deductInventory: fyhServiceConsumables.deductInventory,
    })
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, serviceId));
  const previousByProduct = new Map(
    existing.map((row) => [row.productId, row.deductInventory] as const),
  );

  const rows = (consumables ?? []).filter((c) => c.productId && c.quantity > 0);

  await hairDb.delete(fyhServiceConsumables).where(eq(fyhServiceConsumables.serviceId, serviceId));
  if (!rows.length) return;

  const productIds = [...new Set(rows.map((c) => c.productId))];
  const productRows = await hairDb
    .select({ id: fyhProducts.id, productType: fyhProducts.productType })
    .from(fyhProducts)
    .where(inArray(fyhProducts.id, productIds));
  const professionalByProduct = new Map(
    productRows.map((p) => [p.id, p.productType === 'professional'] as const),
  );

  await hairDb.insert(fyhServiceConsumables).values(
    rows.map((c) => ({
      serviceId,
      productId: c.productId,
      quantity: c.quantity,
      deductInventory: resolveConsumableDeductInventory({
        productId: c.productId,
        explicit: c.deductInventory,
        previousByProduct,
        productIsProfessional: professionalByProduct.get(c.productId),
      }),
    })),
  );
}

export async function createService(input: ServiceInput) {
  const name = canonicalServiceName(input.name);
  if (!name) throw new Error('Service name is required');
  await assertUniqueServiceName(name);
  const durationMinutes = Math.round(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Duration must be a positive number of minutes');
  }
  if (input.sellingPriceRupees < 0 || input.costPriceRupees < 0) {
    throw new Error('Prices cannot be negative');
  }

  const category = await resolveCategory(input);
  const code = await nextServiceCode();
  const gstBps =
    input.gstPercent !== undefined ? toBps(input.gstPercent) : SALON_GST_BPS;
  const commission =
    input.commissionType !== undefined
      ? commissionFields(input)
      : {
          commissionType: 'none' as const,
          commissionFixedPaise: 0,
          commissionPercentBps: 0,
          overrideStaffCommission: false,
        };

  const [row] = await hairDb
    .insert(fyhServices)
    .values({
      name,
      code,
      category,
      durationMinutes,
      pricePaise: toPaise(input.sellingPriceRupees),
      costPricePaise: toPaise(input.costPriceRupees),
      gstBps,
      description: input.description?.trim() || null,
      displayOrder: 100,
      ...commission,
      availableOnline: input.availableOnline ?? false,
      featured: input.featured ?? false,
      showOnWebsite: input.showOnWebsite ?? false,
      isActive: input.isActive !== false,
      averageDurationMinutes: durationMinutes,
    })
    .returning();

  await syncStaff(row.id, input.staffIds);
  await syncConsumables(row.id, input.consumables);
  return row;
}

export async function updateService(id: string, input: ServiceInput) {
  const name = canonicalServiceName(input.name);
  if (!name) throw new Error('Service name is required');
  await assertUniqueServiceName(name, id);
  const durationMinutes = Math.round(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Duration must be a positive number of minutes');
  }
  if (input.sellingPriceRupees < 0 || input.costPriceRupees < 0) {
    throw new Error('Prices cannot be negative');
  }

  const category = await resolveCategory(input);
  const isActive = input.isActive !== false;
  const gstBps =
    input.gstPercent !== undefined ? toBps(input.gstPercent) : SALON_GST_BPS;

  const [row] = await hairDb
    .update(fyhServices)
    .set({
      name,
      category,
      durationMinutes,
      pricePaise: toPaise(input.sellingPriceRupees),
      costPricePaise: toPaise(input.costPriceRupees),
      gstBps,
      description: input.description?.trim() || null,
      isActive,
      archivedAt: isActive ? null : sql`COALESCE(${fyhServices.archivedAt}, now())`,
      updatedAt: new Date(),
      ...(input.commissionType !== undefined ? commissionFields(input) : {}),
      ...(input.availableOnline !== undefined ? { availableOnline: input.availableOnline } : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
      ...(input.showOnWebsite !== undefined ? { showOnWebsite: input.showOnWebsite } : {}),
    })
    .where(eq(fyhServices.id, id))
    .returning();
  if (!row) throw new Error('Service not found');

  await syncStaff(id, input.staffIds);
  await syncConsumables(id, input.consumables);
  return row;
}

/** Soft-archive: keep row for historical invoices; block new bookings. */
export async function archiveService(id: string) {
  const [row] = await hairDb
    .update(fyhServices)
    .set({
      isActive: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(fyhServices.id, id))
    .returning();
  if (!row) throw new Error('Service not found');
  return row;
}

export async function restoreService(id: string) {
  const [row] = await hairDb
    .update(fyhServices)
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where(eq(fyhServices.id, id))
    .returning();
  if (!row) throw new Error('Service not found');
  return row;
}

export async function deleteService(id: string) {
  const existing = await getService(id);
  if (!existing) throw new Error('Service not found');
  try {
    await hairDb.delete(fyhServices).where(eq(fyhServices.id, id));
  } catch {
    throw new Error(
      'Cannot delete this service — it may be linked to appointments. Archive it instead.',
    );
  }
}

/** Services available for new appointments (active only). */
export async function listBookableServices() {
  return listServices({ status: 'active' });
}

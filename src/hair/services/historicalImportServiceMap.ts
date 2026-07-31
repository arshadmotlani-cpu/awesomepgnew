import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhServices } from '@/src/hair/db/schema';
import type { HistoricalLineItem } from '@/src/hair/domain/import/historicalInvoice';
import {
  findClosestOfficialService,
  isTestServiceName,
  shouldHideServiceFromBillable,
} from '@/src/hair/lib/serviceCatalogHygiene';

const CATEGORY_NAMES = new Set(['hair', 'skin', 'makeup', 'nails']);

const SERVICE_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /makeup|bridal|engagement|reception|hd makeup|party makeup/i, category: 'Makeup' },
  { pattern: /nail|manicure|pedicure|polish/i, category: 'Nails' },
  { pattern: /facial|cleanup|clean up|wax|thread|eyebrow|skin|hydra|fruit/i, category: 'Skin' },
  { pattern: /hair|cut|colour|color|keratin|balayage|botox|spa|blow|trim|wash|root/i, category: 'Hair' },
];

export type HistoricalServiceMap = {
  byName: Map<string, { id: string; name: string; category: string | null }>;
  categoryDefault: Map<string, { id: string; name: string }>;
};

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function buildHistoricalServiceMap(
  db: typeof hairDb = hairDb,
): Promise<HistoricalServiceMap> {
  const services = await db
    .select({
      id: fyhServices.id,
      name: fyhServices.name,
      category: fyhServices.category,
    })
    .from(fyhServices)
    .where(eq(fyhServices.isActive, true));

  const byName = new Map<string, { id: string; name: string; category: string | null }>();
  const categoryDefault = new Map<string, { id: string; name: string }>();

  for (const svc of services) {
    if (shouldHideServiceFromBillable(svc.name, null)) continue;
    byName.set(normName(svc.name), {
      id: svc.id,
      name: svc.name,
      category: svc.category,
    });
    const cat = svc.category?.trim();
    if (cat && !categoryDefault.has(cat)) {
      categoryDefault.set(cat, { id: svc.id, name: svc.name });
    }
  }

  return { byName, categoryDefault };
}

function inferCategory(label: string): string | null {
  for (const hint of SERVICE_CATEGORY_HINTS) {
    if (hint.pattern.test(label)) return hint.category;
  }
  return null;
}

function matchService(
  label: string,
  map: HistoricalServiceMap,
): { id?: string; name: string; kind: 'service' | 'custom' } {
  const trimmed = label.trim();
  if (!trimmed) return { name: 'Salon Service', kind: 'custom' };

  if (isTestServiceName(trimmed)) {
    const closest = findClosestOfficialService(trimmed);
    if (closest) {
      const official = map.byName.get(normName(closest.entry.name));
      if (official) return { id: official.id, name: official.name, kind: 'service' };
      return { name: closest.entry.name, kind: 'custom' };
    }
  }

  const normalized = normName(trimmed);
  if (CATEGORY_NAMES.has(normalized)) {
    const cat = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    const def = map.categoryDefault.get(cat);
    if (def) return { id: def.id, name: def.name, kind: 'service' };
    return { name: cat, kind: 'custom' };
  }

  const exact = map.byName.get(normalized);
  if (exact) return { id: exact.id, name: exact.name, kind: 'service' };

  for (const [key, svc] of map.byName) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return { id: svc.id, name: svc.name, kind: 'service' };
    }
  }

  const category = inferCategory(trimmed);
  if (category) {
    const def = map.categoryDefault.get(category);
    if (def) return { id: def.id, name: `${def.name} (${trimmed})`, kind: 'service' };
  }

  return { name: trimmed, kind: 'custom' };
}

export function resolveHistoricalLineItems(
  serviceColumn: string,
  map: HistoricalServiceMap,
): HistoricalLineItem[] {
  const parts = serviceColumn
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const labels = parts.length ? parts : [serviceColumn.trim() || 'Salon Service'];

  return labels.map((label) => {
    const matched = matchService(label, map);
    return {
      description: matched.name,
      serviceId: matched.id,
      kind: matched.kind,
    };
  });
}

export function applyServiceMapToRows<
  T extends { description: string; lineItems: HistoricalLineItem[] },
>(rows: T[], map: HistoricalServiceMap): T[] {
  return rows.map((row) => {
    const lineItems = resolveHistoricalLineItems(row.description, map);
    return {
      ...row,
      lineItems,
      description: lineItems.map((l) => l.description).join(', '),
    };
  });
}


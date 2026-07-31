import {
  OFFICIAL_CATALOG_NAME_SET,
  OFFICIAL_SERVICE_CATALOG,
  type OfficialCatalogEntry,
} from '@/src/hair/data/officialServiceCatalog';
import { canonicalServiceName, normalizeServiceName } from '@/src/hair/lib/serviceName';

const TEST_NAME_PATTERN =
  /\b(uat|test|demo|sample|debug)\b|^rc[\s_-]|^rc$|\brc[\s_-]haircut|\brc[\s_-]blow/i;

const TEST_CODE_PATTERN = /^RC-/i;

export function isTestServiceName(name: string): boolean {
  const n = normalizeServiceName(name);
  if (!n) return false;
  return TEST_NAME_PATTERN.test(n);
}

export function isTestServiceCode(code: string | null | undefined): boolean {
  if (!code?.trim()) return false;
  return TEST_CODE_PATTERN.test(code.trim());
}

export function isOfficialCatalogName(name: string): boolean {
  return OFFICIAL_CATALOG_NAME_SET.has(normalizeServiceName(name));
}

export function isProductionSalonService(name: string, code?: string | null): boolean {
  if (isTestServiceName(name) || isTestServiceCode(code)) return false;
  return isOfficialCatalogName(name);
}

export function isSalonBillableCatalogEntry(entry: OfficialCatalogEntry): boolean {
  return entry.isSalonBillable;
}

/** When false, query-layer catalog filters are skipped (local dev / CI with RC fixtures). */
export function isCatalogHygieneEnforced(): boolean {
  return process.env.HAIR_CATALOG_STRICT === '1';
}

export function normalizeCatalogCategory(raw: string): OfficialCatalogEntry['category'] {
  const key = raw.trim().toLowerCase();
  if (key === 'makeup') return 'Makeup';
  if (key === 'nails') return 'Nails';
  if (key === 'academy') return 'Academy';
  if (key === 'pg') return 'Hair';
  if (key.includes('photography') || key.includes('commercial')) return 'Digital Production';
  if (
    key === 'hair' ||
    key === 'hair care' ||
    key.includes('haircut') ||
    key.includes('styling') ||
    key.includes('stlying') ||
    key.includes('color') ||
    key.includes('treatment') ||
    key.includes('ritual') ||
    key.includes('scalp')
  ) {
    return 'Hair';
  }
  return 'Skin';
}

function catalogIndex(): Map<string, OfficialCatalogEntry> {
  const map = new Map<string, OfficialCatalogEntry>();
  for (const entry of OFFICIAL_SERVICE_CATALOG) {
    map.set(normalizeServiceName(entry.name), entry);
  }
  return map;
}

let cachedCatalogIndex: Map<string, OfficialCatalogEntry> | null = null;

function getCatalogIndex(): Map<string, OfficialCatalogEntry> {
  if (!cachedCatalogIndex) cachedCatalogIndex = catalogIndex();
  return cachedCatalogIndex;
}

const CATEGORY_HINTS: Array<{ pattern: RegExp; category: OfficialCatalogEntry['category'] }> = [
  { pattern: /makeup|bridal|engagement|makeover|saree draping/i, category: 'Makeup' },
  { pattern: /nail|manicure|pedicure|gel polish|extension/i, category: 'Nails' },
  {
    pattern: /facial|cleanup|clean up|wax|thread|bleach|massage|polish|skin|hydra|pearl|d-tan/i,
    category: 'Skin',
  },
  { pattern: /hair|cut|colour|color|keratin|balayage|botox|blow|trim|wash|root|tonning/i, category: 'Hair' },
];

function inferCategory(label: string): OfficialCatalogEntry['category'] | null {
  for (const hint of CATEGORY_HINTS) {
    if (hint.pattern.test(label)) return hint.category;
  }
  return null;
}

function defaultServiceForCategory(category: OfficialCatalogEntry['category']): OfficialCatalogEntry | null {
  const match = OFFICIAL_SERVICE_CATALOG.find(
    (e) => e.category === category && e.isSalonBillable && e.priceRupees > 0,
  );
  return match ?? null;
}

/** Strip test/UAT suffix noise for fuzzy matching (e.g. "RC Haircut UAT UAT"). */
export function stripTestNoise(name: string): string {
  return canonicalServiceName(name)
    .replace(/\b(uat|test|demo|sample|debug)\b/gi, ' ')
    .replace(/\brc\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ClosestOfficialMatch = {
  entry: OfficialCatalogEntry;
  confidence: 'exact' | 'fuzzy' | 'category';
};

/**
 * Map a legacy/test label to the closest official catalogue service.
 */
export function findClosestOfficialService(rawLabel: string): ClosestOfficialMatch | null {
  const trimmed = stripTestNoise(rawLabel);
  if (!trimmed) return null;

  const index = getCatalogIndex();
  const normalizedForms = expandMatchForms(trimmed);

  for (const normalized of normalizedForms) {
    const exact = index.get(normalized);
    if (exact) return { entry: exact, confidence: 'exact' };
  }

  for (const normalized of normalizedForms) {
    for (const [key, entry] of index) {
      if (key.includes(normalized) || normalized.includes(key)) {
        return { entry, confidence: 'fuzzy' };
      }
    }
  }

  const category = inferCategory(trimmed);
  if (category) {
    const fallback = defaultServiceForCategory(category);
    if (fallback) return { entry: fallback, confidence: 'category' };
  }

  return null;
}

function expandMatchForms(label: string): string[] {
  const base = normalizeServiceName(label);
  const forms = new Set<string>([base]);
  if (base.includes('haircut')) {
    forms.add(base.replace(/haircut/g, 'hair cut'));
  }
  if (base.includes('hair cut')) {
    forms.add(base.replace(/hair cut/g, 'haircut'));
  }
  return [...forms];
}

export function shouldHideServiceFromCatalog(name: string, code?: string | null): boolean {
  if (!isCatalogHygieneEnforced()) return false;
  return !isProductionSalonService(name, code);
}

export function shouldHideServiceFromBillable(name: string, code?: string | null): boolean {
  if (!isCatalogHygieneEnforced()) return false;
  if (shouldHideServiceFromCatalog(name, code)) return true;
  const entry = getCatalogIndex().get(normalizeServiceName(name));
  if (!entry) return true;
  return !entry.isSalonBillable;
}

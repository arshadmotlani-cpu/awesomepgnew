/**
 * Wealth OS routing and UI wiring tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { OWNER_PUBLIC_PREFIXES } from '@/src/owner/lib/host';
import { ownerNavItems } from '@/src/owner/lib/ownerNav';

describe('Owner wealth OS wiring', () => {
  test('public routes include wealth pages', () => {
    assert.ok(OWNER_PUBLIC_PREFIXES.includes('/expenses'));
    assert.ok(OWNER_PUBLIC_PREFIXES.includes('/income'));
    assert.ok(OWNER_PUBLIC_PREFIXES.includes('/accounts'));
    assert.ok(OWNER_PUBLIC_PREFIXES.includes('/integrations'));
    assert.ok(OWNER_PUBLIC_PREFIXES.includes('/properties'));
  });

  test('nav includes expenses, income, and integrations', () => {
    const hrefs = ownerNavItems.map((i) => i.href);
    assert.ok(hrefs.includes('/expenses'));
    assert.ok(hrefs.includes('/income'));
    assert.ok(hrefs.includes('/integrations'));
    assert.ok(hrefs.includes('/accounts'));
  });

  test('property enrichment migration exists', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/owner/db/migrations/0003_property_enrichment.sql'),
      'utf8',
    );
    assert.match(sql, /monthly_rental_income_paise/);
    assert.match(sql, /postal_code/);
  });

  test('OwnerHomeDashboard includes wealth command panel', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/owner/components/OwnerHomeDashboard.tsx'),
      'utf8',
    );
    assert.match(src, /WealthCommandPanel/);
  });

  test('property income migration exists', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/owner/db/migrations/0005_property_income_sources.sql'),
      'utf8',
    );
    assert.match(sql, /oo_property_income_sources/);
    assert.match(sql, /oo_property_income_rent_history/);
  });
});

/**
 * Room OS Wave 2 — Integrity Engine preflight tests (ADR-OR-001).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildIntegrityPreflightReport } from '@/src/roomOs/integrity/buildReport';
import {
  computeIntegrityRulePackDigest,
  INTEGRITY_PREFLIGHT_RULES_V1,
  INTEGRITY_PREFLIGHT_V1_ID,
  ruleAppliesToScenario,
} from '@/src/roomOs/integrity/catalog/v1';
import { SCENARIO_SCOPE_REQUIREMENTS } from '@/src/roomOs/integrity/catalog/v1/scenarios';
import { computeScopeDigest, normalizePreflightScope } from '@/src/roomOs/integrity/scopeDigest';
import type { DuplicateFinding, InvariantFinding, PreflightScope } from '@/src/roomOs/integrity/types';
import { validatePreflightScope } from '@/src/roomOs/integrity/validateScope';

const ADR_REASON_CODES = [
  'DUP_RENT_INVOICE_ACTIVE',
  'DUP_ELEC_INVOICE_ACTIVE',
  'DUP_PRIMARY_RESERVATION',
  'DUP_RESIDENCY_OPEN',
  'DUP_CHECKOUT_SETTLEMENT_OPEN',
  'INV_DEPOSIT_NOT_FULLY_HELD',
  'INV_ELEC_PAID_REGEN_RISK',
  'INV_BOOKING_PG_MISMATCH',
  'INV_BED_DOUBLE_OCCUPIED',
] as const;

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function listTsFiles(dir: string): string[] {
  const abs = join(process.cwd(), dir);
  const entries = readdirSync(abs);
  const files: string[] = [];
  for (const entry of entries) {
    const rel = join(dir, entry);
    const full = join(process.cwd(), rel);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(rel));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(rel);
    }
  }
  return files;
}

function baseScope(overrides: Partial<PreflightScope> = {}): PreflightScope {
  return {
    pgId: '00000000-0000-4000-8000-000000000001',
    scenario: 'REACTIVATE_BOOKING',
    bookingId: '00000000-0000-4000-8000-000000000010',
    requestedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Room OS Wave 2 — Integrity Engine', () => {
  test('v1 rule catalog covers all 9 ADR reason codes', () => {
    const catalogCodes = INTEGRITY_PREFLIGHT_RULES_V1.map((r) => r.reasonCode).sort();
    assert.deepEqual(catalogCodes, [...ADR_REASON_CODES].sort());
    assert.equal(INTEGRITY_PREFLIGHT_RULES_V1.length, 9);
  });

  test('rule pack digest is stable for frozen v1 catalog', () => {
    const first = computeIntegrityRulePackDigest();
    const second = computeIntegrityRulePackDigest();
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
  });

  test('scope digest is stable for normalized scope JSON', () => {
    const scope = baseScope({ customerId: undefined, bedId: undefined });
    const first = computeScopeDigest(scope);
    const second = computeScopeDigest(scope);
    assert.equal(first, second);
    assert.deepEqual(normalizePreflightScope(scope).customerId, null);
  });

  test('scope validation rejects missing pgId', async () => {
    const result = await validatePreflightScope(baseScope({ pgId: '' }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, 'INVALID_SCOPE');
  });

  test('scope validation rejects missing requestedAt', async () => {
    const result = await validatePreflightScope(baseScope({ requestedAt: '' }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, 'INVALID_SCOPE');
  });

  test('scope validation rejects unknown scenario', async () => {
    const result = await validatePreflightScope(
      baseScope({ scenario: 'NOT_A_SCENARIO' as PreflightScope['scenario'] }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, 'UNKNOWN_SCENARIO');
  });

  test('scope validation matrix enforces scenario-required fields', async () => {
    for (const [scenario, requirements] of Object.entries(SCENARIO_SCOPE_REQUIREMENTS)) {
      const filled: Partial<PreflightScope> = {
        scenario: scenario as PreflightScope['scenario'],
        bookingId: requirements.bookingId
          ? '00000000-0000-4000-8000-000000000010'
          : undefined,
        customerId: requirements.customerId
          ? '00000000-0000-4000-8000-000000000020'
          : undefined,
        roomId: requirements.roomId ? '00000000-0000-4000-8000-000000000030' : undefined,
        bedId: requirements.bedId ? '00000000-0000-4000-8000-000000000040' : undefined,
        billingMonth: requirements.billingMonth ? '2026-08' : undefined,
      };

      const checks: Array<{ field: keyof PreflightScope; pattern: RegExp }> = [];
      if (requirements.bookingId) checks.push({ field: 'bookingId', pattern: /bookingId/i });
      if (requirements.roomId) checks.push({ field: 'roomId', pattern: /roomId/i });
      if (requirements.bedId) checks.push({ field: 'bedId', pattern: /bedId/i });
      if (requirements.billingMonth) {
        checks.push({ field: 'billingMonth', pattern: /billingMonth/i });
      }

      for (const check of checks) {
        const scope = baseScope({ ...filled, [check.field]: undefined });
        const result = await validatePreflightScope(scope);
        assert.equal(result.ok, false, `${scenario} missing ${String(check.field)}`);
        if (result.ok) continue;
        assert.equal(result.error.code, 'INVALID_SCOPE');
        assert.match(result.error.message, check.pattern);
      }
    }
  });

  test('report builder sets blocked when block-severity findings exist', () => {
    const scope = baseScope();
    const blockDupe: DuplicateFinding = {
      kind: 'rent_invoice',
      severity: 'block',
      entityIds: ['inv-1', 'inv-2'],
      naturalKey: 'booking:1:2026-08',
      reasonCode: 'DUP_RENT_INVOICE_ACTIVE',
      description: 'Duplicate rent invoices.',
    };
    const warnDupe: DuplicateFinding = {
      kind: 'checkout_settlement',
      severity: 'warn',
      entityIds: ['set-1'],
      naturalKey: 'booking:1:checkout',
      reasonCode: 'DUP_CHECKOUT_SETTLEMENT_OPEN',
      description: 'Open checkout settlement duplicate.',
    };
    const blockInv: InvariantFinding = {
      kind: 'occupancy',
      severity: 'block',
      reasonCode: 'INV_BED_DOUBLE_OCCUPIED',
      description: 'Bed conflict.',
      context: { bedId: 'bed-1' },
    };

    const blockedReport = buildIntegrityPreflightReport({
      scope,
      results: { duplicates: [blockDupe, warnDupe], invariants: [] },
      reportId: 'report-block',
      computedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(blockedReport.blocked, true);
    assert.equal(blockedReport.blockReasons.length, 1);
    assert.equal(blockedReport.summary.blockCount, 1);
    assert.equal(blockedReport.summary.warnCount, 1);
    assert.equal(blockedReport.warnings.length, 1);
    assert.equal(blockedReport.rulePackId, INTEGRITY_PREFLIGHT_V1_ID);

    const warnOnlyReport = buildIntegrityPreflightReport({
      scope,
      results: { duplicates: [warnDupe], invariants: [] },
      reportId: 'report-warn',
      computedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(warnOnlyReport.blocked, false);
    assert.equal(warnOnlyReport.summary.warnCount, 1);

    const invariantBlockReport = buildIntegrityPreflightReport({
      scope,
      results: { duplicates: [], invariants: [blockInv] },
      reportId: 'report-inv',
      computedAt: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(invariantBlockReport.blocked, true);
    assert.equal(invariantBlockReport.summary.blockCount, 1);
  });

  test('ruleAppliesToScenario gates lifecycle vs money scenarios', () => {
    const rentRule = INTEGRITY_PREFLIGHT_RULES_V1.find(
      (r) => r.reasonCode === 'DUP_RENT_INVOICE_ACTIVE',
    );
    assert.ok(rentRule);
    assert.equal(ruleAppliesToScenario(rentRule!, 'REGENERATE_ELECTRICITY'), true);
    assert.equal(ruleAppliesToScenario(rentRule!, 'ROLLBACK_VACATING'), false);

    const primaryRule = INTEGRITY_PREFLIGHT_RULES_V1.find(
      (r) => r.reasonCode === 'DUP_PRIMARY_RESERVATION',
    );
    assert.ok(primaryRule);
    assert.equal(ruleAppliesToScenario(primaryRule!, 'REPAIR_OCCUPANCY'), true);
  });

  test('integrity/v1 API module exposes runPreflight wrapper', () => {
    const src = read('src/roomOs/api/v1/integrity.ts');
    assert.match(src, /apiVersion: 'integrity\/v1'/);
    assert.match(src, /runPreflight/);
    assert.doesNotMatch(src, /billingIntegrityRepair/);
    assert.doesNotMatch(src, /checkoutSettlementRepair/);
  });

  test('runPreflight orchestrator does not emit outbox events', () => {
    const src = read('src/roomOs/integrity/runPreflight.ts');
    assert.doesNotMatch(src, /appendRoomOsOutboxEntry/);
    assert.doesNotMatch(src, /integrity\.flag_raised/);
  });

  test('integrity module must not import repair or projector paths', () => {
    const integrityFiles = listTsFiles('src/roomOs/integrity');
    const forbiddenPatterns = [
      /@\/src\/roomOs\/projectors\//,
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /releaseDuplicateReservations/,
      /checkoutSettlementEngineV2/,
      /from ['"]react['"]/,
      /from ['"]next\//,
    ];
    for (const file of integrityFiles) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} must not import forbidden dependency`);
      }
    }
  });

  test('integrity module may import db client for read-only checks', () => {
    const checkFiles = listTsFiles('src/roomOs/integrity/checks');
    const dbImports = checkFiles.filter((file) => read(file).includes('@/src/db/client'));
    assert.ok(dbImports.length > 0, 'expected at least one read-only db-backed check');
  });
});

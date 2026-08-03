/**
 * Room OS Wave 2 — Certification Engine tests.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  aggregateCertificationStatus,
  buildCertificationReport,
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
import {
  CERTIFICATION_CHECKS_V1,
  CERTIFICATION_SUITE_SHANTINAGAR_V1,
  SHANTINAGAR_RESIDENT_PARITY_TARGET,
} from '@/src/roomOs/certification/catalog/v1';
import { CERTIFICATION_CONTRACT_VERSION } from '@/src/roomOs/certification/types';

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

describe('Room OS Wave 2 — Certification Engine', () => {
  test('v1 check catalog covers 14 Shantinagar parity checks (Wave 6 workflow + metrics)', () => {
    assert.equal(CERTIFICATION_CHECKS_V1.length, 14);
    const checkIds = CERTIFICATION_CHECKS_V1.map((c) => c.checkId).sort();
    assert.deepEqual(checkIds, [
      'BED_OCCUPANCY_PARITY',
      'BOOKING_LEDGER_PARITY',
      'BUSINESS_METRICS_ROLLUP_PARITY',
      'PAYMENT_PROOF_STATE_PARITY',
      'PROPERTY_INDEX_MATERIALIZED_PARITY',
      'PROPERTY_KPI_STRIP_PARITY',
      'REPLAY_SAMPLE_PARITY',
      'RFE_BED_BRAIN_BRIDGE',
      'ROOM_ELECTRICITY_STATUS_PARITY',
      'RULES_DB_PARITY',
      'SHANTINAGAR_PORTAL_PARITY',
      'TIMELINE_LAYER_B',
      'WORKFLOW_PAYMENT_PROOF_PARITY',
      'WORK_QUEUE_MATERIALIZED_PARITY',
    ]);
    assert.equal(SHANTINAGAR_RESIDENT_PARITY_TARGET, 12);
    assert.equal(CERTIFICATION_SUITE_SHANTINAGAR_V1, 'shantinagar-v1');
  });

  test('aggregateCertificationStatus prefers fail over warning over pass', () => {
    assert.equal(aggregateCertificationStatus([passFinding('A', 'kpi', 'ok')]), 'pass');
    assert.equal(
      aggregateCertificationStatus([passFinding('A', 'kpi', 'ok'), warnFinding('B', 'kpi', 'warn')]),
      'warning',
    );
    assert.equal(
      aggregateCertificationStatus([
        passFinding('A', 'kpi', 'ok'),
        failFinding('B', 'kpi', 'bad'),
      ]),
      'fail',
    );
  });

  test('buildCertificationReport assembles summary counts and contract version', () => {
    const report = buildCertificationReport({
      suiteId: CERTIFICATION_SUITE_SHANTINAGAR_V1,
      ctx: {
        pgId: '00000000-0000-4000-8000-000000000001',
        pgName: 'Shantinagar',
        billingMonth: '2026-08-01',
        asOf: '2026-08-02',
      },
      findings: [
        passFinding('PROPERTY_INDEX_MATERIALIZED_PARITY', 'property_index', 'ok'),
        warnFinding('WORK_QUEUE_MATERIALIZED_PARITY', 'work_queue', 'live only'),
      ],
      shantinagarResidents: { total: 12, passed: 12, failed: 0, certified: true },
      reportId: 'report-test-id',
      computedAt: '2026-08-02T00:00:00.000Z',
    });

    assert.equal(report.contractVersion, CERTIFICATION_CONTRACT_VERSION);
    assert.equal(report.status, 'warning');
    assert.equal(report.summary.passCount, 1);
    assert.equal(report.summary.warningCount, 1);
    assert.equal(report.summary.failCount, 0);
    assert.equal(report.summary.totalChecks, 2);
    assert.equal(report.summary.shantinagarResidents?.certified, true);
  });

  test('certification API module exposes certification/v1 contract', () => {
    const api = read('src/roomOs/api/v1/certification.ts');
    assert.match(api, /apiVersion: 'certification\/v1'/);
    assert.match(api, /runCertificationApi/);
    assert.match(api, /runShantinagarCertificationApi/);
  });

  test('certification module must not import repair writers, outbox append, or React', () => {
    const certFiles = listTsFiles('src/roomOs/certification');
    const forbiddenPatterns = [
      /billingIntegrityRepair/,
      /checkoutSettlementRepair/,
      /checkoutSettlementEngineV2/,
      /appendRoomOsOutboxEntry/,
      /enqueuePropertyIndexRebuild/,
      /from ['"]react['"]/,
      /from ['"]next\//,
    ];
    for (const file of certFiles) {
      const src = read(file);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(src, pattern, `${file} violates certification forbidden matrix`);
      }
    }
  });

  test('certification checks are read-only — no INSERT/UPDATE/DELETE in SQL strings', () => {
    const checkFiles = listTsFiles('src/roomOs/certification/checks');
    for (const file of checkFiles) {
      const src = read(file);
      assert.doesNotMatch(src, /\bINSERT INTO\b/i, `${file} must not write data`);
      assert.doesNotMatch(src, /\bUPDATE\b/i, `${file} must not write data`);
      assert.doesNotMatch(src, /\bDELETE FROM\b/i, `${file} must not write data`);
    }
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { electricityReadingsWithoutBillsAlertMessage } from '@/src/lib/billing/electricityReadingsWithoutBills';

describe('electricityReadingsWithoutBills', () => {
  it('emits the canonical RED alert copy when findings exist', () => {
    assert.equal(
      electricityReadingsWithoutBillsAlertMessage(1),
      'Electricity readings exist but bills were not generated.',
    );
    assert.equal(
      electricityReadingsWithoutBillsAlertMessage(3),
      'Electricity readings exist but bills were not generated.',
    );
  });

  it('returns empty alert when no findings', () => {
    assert.equal(electricityReadingsWithoutBillsAlertMessage(0), '');
  });

  it('audit module covers meter logs, failed jobs, stuck jobs, and empty fan-out', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/electricityReadingsWithoutBills.ts'),
      'utf8',
    );
    assert.match(src, /METER_LOG_WITHOUT_BILL/);
    assert.match(src, /GENERATION_JOB_FAILED_WITHOUT_BILL/);
    assert.match(src, /GENERATION_JOB_STUCK_WITHOUT_BILL/);
    assert.match(src, /BILL_WITHOUT_INVOICES/);
    assert.match(src, /runElectricityReadingsWithoutBillsAudit/);
  });

  it('System Health audit includes Electricity Brain Integrity section', () => {
    const health = readFileSync(
      join(process.cwd(), 'src/services/systemHealthAudit.ts'),
      'utf8',
    );
    assert.match(health, /Electricity Brain Integrity/);
    assert.match(health, /runElectricityReadingsWithoutBillsAudit/);
    assert.match(health, /electricityBrain\.alertMessage/);
  });
});

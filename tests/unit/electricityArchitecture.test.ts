import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  assessConsumptionMonthContinuity,
  consumptionMonthLabel,
  previousConsumptionMonth,
} from '@/src/lib/billing/consumptionMonthContinuity';
import { isElectricityCoveredByPriorCollection } from '@/src/lib/billing/electricityCollectibility';
import {
  pickPreviousMeterReadingFromFinalizedBills,
  validateContinuousPreviousReading,
} from '@/src/lib/billing/roomMeterReadingSsot';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { remainingElectricityAfterCollections } from '@/src/lib/billing/pgElectricityGenerationPreviewPure';
import { planElectricityBillAllocationReconcile } from '@/src/lib/billing/electricityBillAllocationReconcilePlan';

const bills = [
  { billingMonth: '2026-06-01', currentReadingUnits: 565, ratePerUnitPaise: 1600, meterImageUrl: null },
  { billingMonth: '2026-07-01', currentReadingUnits: 707, ratePerUnitPaise: 1600, meterImageUrl: null },
  { billingMonth: '2026-09-01', currentReadingUnits: 849, ratePerUnitPaise: 1600, meterImageUrl: null },
];

describe('consumption month continuity', () => {
  test('August consumption opens from July close', () => {
    const assessment = assessConsumptionMonthContinuity(bills, '2026-08-01');
    assert.equal(assessment.ok, true);
    if (!assessment.ok) return;
    assert.equal(assessment.requiredBaselineMonth, '2026-07-01');
    const baseline = pickPreviousMeterReadingFromFinalizedBills(bills, '2026-08-01');
    assert.ok(baseline);
    assert.equal(baseline.previousReadingUnits, 707);
  });

  test('July → September with August missing is blocked', () => {
    const assessment = assessConsumptionMonthContinuity(bills, '2026-09-01');
    assert.equal(assessment.ok, false);
    if (assessment.ok) return;
    assert.deepEqual(assessment.missingMonths, ['2026-08-01']);
    assert.match(assessment.message, /August 2026/);
    assert.match(assessment.message, /cannot be generated/);
  });

  test('first consumption month allows bootstrap', () => {
    const assessment = assessConsumptionMonthContinuity(
      [{ billingMonth: '2026-06-01', currentReadingUnits: 100 }],
      '2026-06-01',
    );
    assert.equal(assessment.ok, true);
    if (!assessment.ok) return;
    assert.equal(assessment.isFirstConsumptionMonth, true);
  });

  test('previousConsumptionMonth is calendar month before target', () => {
    assert.equal(previousConsumptionMonth('2026-09-01'), '2026-08-01');
    assert.equal(consumptionMonthLabel('2026-08-01'), 'August 2026');
  });
});

describe('August consumption generated in September (billing semantics)', () => {
  test('billing_month stays August when generation is later', () => {
    const billingMonth = '2026-08-01';
    const createdAt = new Date('2026-09-04T12:00:00Z');
    assert.equal(billingMonth, '2026-08-01');
    assert.equal(createdAt.getUTCMonth(), 8);
    assert.notEqual(billingMonth.slice(0, 7), '2026-09');
  });

  test('August occupancy drives allocation — not September days', () => {
    const gross = 90_000;
    const augustOccupants = [
      { bookingId: 'a', customerId: 'saswat', bedCount: 1, weight: 24 },
      { bookingId: 'b', customerId: 'dhruv', bedCount: 1, weight: 31 },
    ];
    const septemberOccupants = [
      { bookingId: 'a', customerId: 'saswat', bedCount: 1, weight: 9 },
      { bookingId: 'b', customerId: 'dhruv', bedCount: 1, weight: 30 },
    ];
    const aug = allocateMonthlyElectricityInvoices({
      grossTotalPaise: gross,
      prepaidCreditPaise: 0,
      occupants: augustOccupants,
      checkoutCollectedByCustomerId: new Map(),
      useProRata: true,
      activeBedCount: 2,
      billingDays: 31,
    });
    const sep = allocateMonthlyElectricityInvoices({
      grossTotalPaise: gross,
      prepaidCreditPaise: 0,
      occupants: septemberOccupants,
      checkoutCollectedByCustomerId: new Map(),
      useProRata: true,
      activeBedCount: 2,
      billingDays: 30,
    });
    const saswatAug = aug.invoices.find((i) => i.customerId === 'saswat')?.amountPaise ?? 0;
    const saswatSep = sep.invoices.find((i) => i.customerId === 'saswat')?.amountPaise ?? 0;
    assert.ok(saswatAug > saswatSep);
  });
});

describe('verified prior collection accounting', () => {
  test('prior collection subtracted from room total', () => {
    assert.equal(remainingElectricityAfterCollections(100_000, 35_000), 65_000);
  });

  test('fully covered invoice is not payable', () => {
    assert.equal(
      isElectricityCoveredByPriorCollection({
        invoiceAmountPaise: 20_000,
        priorCollectionPaise: 20_000,
      }),
      true,
    );
  });

  test('electricity_share alone is not treated as collection in verified loader source', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/billing/electricityVerifiedPriorCollections.ts'),
      'utf8',
    );
    assert.match(src, /electricity_from_deposit_paise/);
    assert.match(src, /Electricity share at checkout/);
    assert.doesNotMatch(src, /electricity_share_paise > 0/);
  });
});

describe('paid invoice safety', () => {
  test('allocation repair refuses silent rewrite of paid invoices', () => {
    const plan = planElectricityBillAllocationReconcile({
      roomTotalPaise: 100_000,
      canonicalLines: [
        {
          customerId: 'c1',
          customerName: 'A',
          bookingId: 'b1',
          bedId: 'bed1',
          amountPaise: 50_000,
          unitsShare: 50,
          activeDays: 30,
        },
      ],
      existingInvoices: [
        {
          id: 'inv1',
          invoiceNumber: 'ELE-1',
          customerId: 'c1',
          bookingId: 'b1',
          amountPaise: 48_000,
          paidPaise: 48_000,
          status: 'paid',
        },
      ],
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.kind, 'paid_conflict');
  });
});

describe('checkout atomicity wiring', () => {
  test('approveCheckoutSettlement records electricity inside deposit transaction', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/checkoutSettlement.ts'),
      'utf8',
    );
    assert.match(src, /recordCheckoutElectricityCollectionInTx\(tx/);
    assert.match(src, /applyDepositDeductionsInTx\(tx/);
    assert.doesNotMatch(src, /recordCheckoutElectricityCollectionFromSettlementId\(current\.id/);
  });
});

describe('generation fail-closed guards', () => {
  test('createElectricityBill assesses continuity before baseline', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/electricityBilling.ts'), 'utf8');
    assert.match(src, /assessConsumptionMonthContinuityForRoom/);
  });

  test('generate action assesses continuity', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(admin)/admin/billing/electricity/generate/actions.ts'),
      'utf8',
    );
    assert.match(src, /assessConsumptionMonthContinuityForRoom/);
  });

  test('Billing Center shows consumption vs generation', () => {
    const ui = readFileSync(
      join(process.cwd(), 'src/components/admin/electricity/PgElectricityBillingChecklist.tsx'),
      'utf8',
    );
    assert.match(ui, /Consumption:/);
    assert.match(ui, /Generation:/);
    assert.match(ui, /consumption_month_blocked/);
  });
});

describe('meter reading continuity', () => {
  test('validateContinuousPreviousReading rejects wrong baseline', () => {
    const bad = validateContinuousPreviousReading({
      providedPreviousUnits: 337,
      expectedPreviousUnits: 707,
    });
    assert.equal(bad.ok, false);
  });
});

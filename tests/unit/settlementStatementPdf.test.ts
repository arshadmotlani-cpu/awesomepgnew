import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import { buildFallbackPgLetterhead } from '../../src/lib/billing/pgLetterheadFallback';
import {
  estimatedSettlementFromCheckoutWaterfall,
} from '../../src/lib/vacating/estimatedSettlementPreview';
import { buildSettlementStatementModel } from '../../src/lib/vacating/settlementStatementModel';
import {
  generateSettlementStatementPdf,
  settlementStatementPdfFilename,
} from '../../src/lib/billing/settlementStatementPdf';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function sampleDocument() {
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
  const preview = estimatedSettlementFromCheckoutWaterfall({
    detail: {
      bookingId: 'bk-1',
      noticeGivenDate: '2026-07-21',
      vacatingDate: '2026-07-21',
      monthlyRentPaiseSnapshot: 150_000,
      depositRefundablePaise: 412_100,
      preview: { electricityDeductionPaise: 0 },
      approvalBaselineLocked: true,
      amountsLocked: false,
    },
    waterfall,
  });
  return buildSettlementStatementModel({
    preview,
    vacatingRequestId: 'vac-pdf-test-id',
    bookingId: 'bk-1',
    customerName: 'PDF Test Resident',
    customerPhone: '9999999999',
    bookingCode: 'BK-PDF',
    pgName: 'Awesome PG',
    roomNumber: '101',
    bedCode: 'A1',
    noticeGivenDate: '2026-07-21',
    vacatingDate: '2026-07-21',
    letterhead: buildFallbackPgLetterhead('Awesome PG'),
  });
}

test('settlementStatementPdfFilename sanitizes statement numbers', () => {
  assert.equal(settlementStatementPdfFilename('EST-VAC-1234'), 'EST-VAC-1234.pdf');
  assert.equal(settlementStatementPdfFilename('EST/2026\\test'), 'EST-2026-test.pdf');
});

test('generateSettlementStatementPdf returns non-empty PDF bytes', async () => {
  const document = sampleDocument();
  const bytes = await generateSettlementStatementPdf(document);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  assert.equal(bytes[0], 0x25);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x44);
  assert.equal(bytes[3], 0x46);
});

test('settlement statement PDF pipeline files exist', () => {
  assert.match(read('src/lib/billing/financialDocumentPdf.ts'), /formatInrPdf/);
  assert.match(read('src/lib/billing/settlementStatementPdfDownload.ts'), /application\/pdf/);
  assert.match(read('src/lib/billing/settlementStatementPdfLinks.ts'), /settlementStatementPdfDownloadHref/);
  assert.match(
    read('app/api/vacating/[requestId]/settlement-statement/pdf/route.ts'),
    /settlement-statement\/pdf/,
  );
  assert.match(
    read('app/(admin)/admin/vacating/[requestId]/settlement-statement/page.tsx'),
    /FinancialDocumentToolbar/,
  );
  assert.match(read('src/components/billing/FinancialDocumentLayout.tsx'), /FinancialDocumentHeroGrid/);
});

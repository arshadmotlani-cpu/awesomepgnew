import { eq, sum } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { capitalDb } from '@/src/capital/db/client';
import {
  acAssets,
  acAutomotiveDetails,
  acCapitalInvestments,
  acPaymentsReceived,
} from '@/src/capital/db/schema';
import { formatInrPlain, paiseToRupees } from '@/src/capital/lib/money';
import { logActivity } from './activity';

function vehicleDealRowsCsvHeader() {
  return [
    'Name',
    'Status',
    'Purchase',
    'Repairs',
    'Refunds',
    'Net Cost',
    'Sale',
    'Business Profit',
    'Sufii Share',
    'Investor Pool',
    'My Share',
    'Business ROI %',
    'My ROI %',
  ].join(',');
}

function vehicleDealRowCsv(asset: typeof acAssets.$inferSelect): string {
  return [
    `"${asset.displayName.replace(/"/g, '""')}"`,
    asset.status,
    paiseToRupees(asset.purchasePricePaise),
    paiseToRupees(asset.repairTotalPaise ?? 0),
    paiseToRupees(asset.dealerRefundTotalPaise ?? 0),
    paiseToRupees(asset.totalInvestmentPaise),
    asset.actualSalePricePaise != null ? paiseToRupees(asset.actualSalePricePaise) : '',
    asset.profitPaise != null ? paiseToRupees(asset.profitPaise) : '',
    asset.operatingPartnerProfitPaise != null || asset.partnerSharePaise != null
      ? paiseToRupees(asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? 0)
      : '',
    asset.investorProfitPoolPaise != null ? paiseToRupees(asset.investorProfitPoolPaise) : '',
    asset.mySharePaise != null ? paiseToRupees(asset.mySharePaise) : '',
    asset.businessRoiBps != null ? (asset.businessRoiBps / 100).toFixed(1) : '',
    asset.myRoiBps != null ? (asset.myRoiBps / 100).toFixed(1) : '',
  ].join(',');
}

export async function generateCsvReport(type: string): Promise<string> {
  const lines: string[] = [];

  if (type === 'outstanding') {
    lines.push('Registration,Display Name,Status,Investment,Outstanding,Settlement %');
    const rows = await capitalDb
      .select({ asset: acAssets, auto: acAutomotiveDetails })
      .from(acAssets)
      .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId));
    for (const { asset, auto } of rows) {
      lines.push(
        [
          auto.registrationNumber,
          asset.displayName,
          asset.status,
          paiseToRupees(asset.totalInvestmentPaise),
          paiseToRupees(asset.outstandingPaise),
          asset.settlementPctBps != null ? (asset.settlementPctBps / 100).toFixed(1) : '',
        ].join(','),
      );
    }
  } else if (type === 'cash-flow') {
    lines.push('Date,Type,Amount,Mode,Reference');
    const payments = await capitalDb
      .select()
      .from(acPaymentsReceived)
      .where(eq(acPaymentsReceived.isReversed, false));
    for (const p of payments) {
      lines.push(
        [
          p.receivedAt,
          p.paymentType,
          paiseToRupees(p.amountPaise),
          p.paymentMode,
          p.referenceNumber ?? '',
        ].join(','),
      );
    }
    const capital = await capitalDb
      .select()
      .from(acCapitalInvestments)
      .where(eq(acCapitalInvestments.isReversed, false));
    for (const c of capital) {
      lines.push(
        [
          c.investedAt,
          'capital_investment',
          paiseToRupees(c.amountPaise),
          c.paymentMode,
          c.referenceNumber ?? '',
        ].join(','),
      );
    }
    const { acManualProfits } = await import('@/src/capital/db/schema');
    const manuals = await capitalDb
      .select()
      .from(acManualProfits)
      .where(eq(acManualProfits.isReversed, false));
    for (const m of manuals) {
      lines.push(
        [
          m.profitDate,
          `manual_profit:${m.category}`,
          paiseToRupees(m.amountPaise),
          m.source,
          m.description,
        ].join(','),
      );
    }
  } else if (type === 'ledger') {
    lines.push('Date,Type,Direction,Amount,Description,Asset');
    const { acLedgerEntries } = await import('@/src/capital/db/schema');
    const { desc } = await import('drizzle-orm');
    const entries = await capitalDb
      .select()
      .from(acLedgerEntries)
      .orderBy(desc(acLedgerEntries.createdAt));
    for (const e of entries) {
      lines.push(
        [
          e.createdAt.toISOString().slice(0, 10),
          e.entryType,
          e.direction,
          paiseToRupees(e.amountPaise),
          `"${e.description.replace(/"/g, '""')}"`,
          e.assetId ?? '',
        ].join(','),
      );
    }
  } else if (type === 'vehicles' || type === 'pnl' || type === 'roi') {
    lines.push(vehicleDealRowsCsvHeader());
    const rows = await capitalDb
      .select({ asset: acAssets })
      .from(acAssets)
      .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId));
    for (const { asset } of rows) {
      if (asset.status === 'cancelled') continue;
      lines.push(vehicleDealRowCsv(asset));
    }
  } else {
    lines.push('Report,Value');
    const [cap] = await capitalDb
      .select({ t: sum(acCapitalInvestments.amountPaise) })
      .from(acCapitalInvestments)
      .where(eq(acCapitalInvestments.isReversed, false));
    const [pay] = await capitalDb
      .select({ t: sum(acPaymentsReceived.amountPaise) })
      .from(acPaymentsReceived)
      .where(eq(acPaymentsReceived.isReversed, false));
    lines.push(`Total Capital,${formatInrPlain(Number(cap?.t ?? 0))}`);
    lines.push(`Total Received,${formatInrPlain(Number(pay?.t ?? 0))}`);
  }

  await logActivity({ action: 'export_generated', afterState: { type, format: 'csv' } });
  return lines.join('\n');
}

export async function generateExcelReport(type: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type);

  if (type === 'outstanding') {
    sheet.columns = [
      { header: 'Registration', key: 'reg', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Investment (₹)', key: 'investment', width: 15 },
      { header: 'Outstanding (₹)', key: 'outstanding', width: 15 },
    ];
    const rows = await capitalDb
      .select({ asset: acAssets, auto: acAutomotiveDetails })
      .from(acAssets)
      .innerJoin(acAutomotiveDetails, eq(acAssets.id, acAutomotiveDetails.assetId));
    for (const { asset, auto } of rows) {
      sheet.addRow({
        reg: auto.registrationNumber,
        name: asset.displayName,
        status: asset.status,
        investment: paiseToRupees(asset.totalInvestmentPaise),
        outstanding: paiseToRupees(asset.outstandingPaise),
      });
    }
  } else if (type === 'vehicles' || type === 'pnl' || type === 'roi') {
    sheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Purchase', key: 'purchase', width: 12 },
      { header: 'Repairs', key: 'repairs', width: 12 },
      { header: 'Refunds', key: 'refunds', width: 12 },
      { header: 'Net Cost', key: 'netCost', width: 12 },
      { header: 'Sale', key: 'sale', width: 12 },
      { header: 'Business Profit', key: 'businessProfit', width: 14 },
      { header: 'Sufii Share', key: 'sufii', width: 12 },
      { header: 'Investor Pool', key: 'investorPool', width: 12 },
      { header: 'My Share', key: 'myShare', width: 12 },
      { header: 'Business ROI %', key: 'bizRoi', width: 12 },
      { header: 'My ROI %', key: 'myRoi', width: 10 },
    ];
    const rows = await capitalDb.select().from(acAssets);
    for (const asset of rows) {
      if (asset.status === 'cancelled') continue;
      sheet.addRow({
        name: asset.displayName,
        status: asset.status,
        purchase: paiseToRupees(asset.purchasePricePaise),
        repairs: paiseToRupees(asset.repairTotalPaise ?? 0),
        refunds: paiseToRupees(asset.dealerRefundTotalPaise ?? 0),
        netCost: paiseToRupees(asset.totalInvestmentPaise),
        sale:
          asset.actualSalePricePaise != null ? paiseToRupees(asset.actualSalePricePaise) : '',
        businessProfit: asset.profitPaise != null ? paiseToRupees(asset.profitPaise) : '',
        sufii:
          asset.operatingPartnerProfitPaise != null || asset.partnerSharePaise != null
            ? paiseToRupees(asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? 0)
            : '',
        investorPool:
          asset.investorProfitPoolPaise != null
            ? paiseToRupees(asset.investorProfitPoolPaise)
            : '',
        myShare: asset.mySharePaise != null ? paiseToRupees(asset.mySharePaise) : '',
        bizRoi: asset.businessRoiBps != null ? asset.businessRoiBps / 100 : '',
        myRoi: asset.myRoiBps != null ? asset.myRoiBps / 100 : '',
      });
    }
  } else {
    sheet.addRow(['Report', type]);
    sheet.addRow(['Generated', new Date().toISOString()]);
  }

  await logActivity({ action: 'export_generated', afterState: { type, format: 'xlsx' } });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generatePdfReport(type: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = `Automotive Capital — ${type} report\nGenerated: ${new Date().toLocaleString('en-IN')}`;
  page.drawText(text, { x: 50, y: 800, size: 14, font });
  await logActivity({ action: 'export_generated', afterState: { type, format: 'pdf' } });
  return pdf.save();
}

import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { loadKycImageBytes } from '@/src/lib/kyc/loadKycImageBytes';
import type { KycSubmissionAdminContext } from '@/src/services/kycAdminAccess';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

export type AadhaarPdfInput = {
  context: KycSubmissionAdminContext;
  generatedAt?: Date;
};

export function aadhaarPdfFilename(residentName: string): string {
  const slug =
    residentName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'resident';
  return `aadhaar-${slug}.pdf`;
}

function formatGeneratedDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function fitImageRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: (boxW - w) / 2,
    y: (boxH - h) / 2,
    w,
    h,
  };
}

async function embedImage(
  pdfDoc: PDFDocument,
  buffer: Buffer,
  mime: string,
): Promise<PDFImage> {
  const normalizedMime = mime.toLowerCase().split(';')[0]?.trim() ?? 'image/jpeg';
  if (normalizedMime === 'image/png') {
    return pdfDoc.embedPng(buffer);
  }
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    return pdfDoc.embedJpg(buffer);
  }
  const jpeg = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
  return pdfDoc.embedJpg(jpeg);
}

function drawDivider(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: rgb(0.75, 0.75, 0.75),
  });
}

function drawSection(
  page: PDFPage,
  fonts: { regular: Awaited<ReturnType<PDFDocument['embedFont']>>; bold: Awaited<ReturnType<PDFDocument['embedFont']>> },
  label: string,
  image: PDFImage,
  sectionTop: number,
  sectionHeight: number,
) {
  const labelY = sectionTop - 14;
  page.drawText(label, {
    x: MARGIN,
    y: labelY,
    size: 11,
    font: fonts.bold,
    color: rgb(0.15, 0.15, 0.15),
  });

  drawDivider(page, labelY - 8);

  const imageBoxTop = labelY - 16;
  const imageBoxHeight = sectionHeight - 34;
  const imageBoxBottom = imageBoxTop - imageBoxHeight;

  const imgSize = image.scale(1);
  const fit = fitImageRect(imgSize.width, imgSize.height, CONTENT_W, imageBoxHeight - 8);

  page.drawImage(image, {
    x: MARGIN + fit.x,
    y: imageBoxBottom + fit.y + 4,
    width: fit.w,
    height: fit.h,
  });

  drawDivider(page, imageBoxBottom);
}

export async function generateAadhaarPdf(input: AadhaarPdfInput): Promise<Uint8Array> {
  const { submission, customerId, customerName, bookingId, bookingCode } = input.context;
  if (submission.status !== 'approved') {
    throw new Error('KYC submission is not approved.');
  }
  if (!submission.aadhaarFrontPath?.trim() || !submission.aadhaarBackPath?.trim()) {
    throw new Error('Aadhaar images are unavailable.');
  }

  const [frontFile, backFile] = await Promise.all([
    loadKycImageBytes(submission.aadhaarFrontPath, submission.aadhaarFrontMime),
    loadKycImageBytes(submission.aadhaarBackPath, submission.aadhaarBackMime),
  ]);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const generatedAt = input.generatedAt ?? new Date();
  let y = PAGE_H - MARGIN;

  page.drawText(customerName, {
    x: MARGIN,
    y: y - 16,
    size: 14,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 30;

  page.drawText(`Resident ID: ${customerId}`, {
    x: MARGIN,
    y: y - 10,
    size: 10,
    font: regular,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 14;

  const bookingLabel = bookingCode ?? bookingId ?? '—';
  page.drawText(`Booking ID: ${bookingLabel}`, {
    x: MARGIN,
    y: y - 10,
    size: 10,
    font: regular,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 14;

  page.drawText(`Generated: ${formatGeneratedDate(generatedAt)}`, {
    x: MARGIN,
    y: y - 10,
    size: 10,
    font: regular,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 18;

  drawDivider(page, y);

  const bodyTop = y - 12;
  const bodyBottom = MARGIN;
  const bodyHeight = bodyTop - bodyBottom;
  const sectionHeight = bodyHeight / 2;

  const [frontImage, backImage] = await Promise.all([
    embedImage(pdfDoc, frontFile.buffer, frontFile.mime),
    embedImage(pdfDoc, backFile.buffer, backFile.mime),
  ]);

  drawSection(page, fonts, 'AADHAAR FRONT', frontImage, bodyTop, sectionHeight);
  drawSection(
    page,
    fonts,
    'AADHAAR BACK',
    backImage,
    bodyTop - sectionHeight,
    sectionHeight,
  );

  return pdfDoc.save();
}

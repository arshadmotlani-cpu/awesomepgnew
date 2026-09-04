/**
 * SSOT — payment-review purpose / operator-facing classification.
 *
 * Financial invoices and payment links may travel through the deposit_link
 * review channel; that must not force the "Deposit Collection" label.
 */

import { ROOM_CHANGE_INVOICE_SOURCE, ROOM_SHIFT_FEE_PAISE } from '@/src/services/roomShiftQuote';

export type PaymentReviewPurposeCode =
  | 'DEPOSIT_COLLECTION'
  | 'RENT'
  | 'ELECTRICITY'
  | 'ROOM_CHANGE_FEE'
  | 'ROOM_CHANGE_SETTLEMENT'
  | 'EXTENSION'
  | 'COMBINED'
  | 'BOOKING'
  | 'OTHER';

export type PaymentReviewPurposeResolution = {
  purpose: PaymentReviewPurposeCode;
  /** Operator-facing header label. */
  label: string;
  /** When false, hide rent/credit waterfall on payment review. */
  showRoomChangeWaterfall: boolean;
  sameRoomBedChange: boolean;
};

const ROOM_CHANGE_SOURCES = new Set<string>(Object.values(ROOM_CHANGE_INVOICE_SOURCE));

export function isRoomChangeInvoiceSource(sourceTable: string | null | undefined): boolean {
  return Boolean(sourceTable && ROOM_CHANGE_SOURCES.has(sourceTable));
}

/** Detect same-room bed change from frozen quote labels (R204 → Room 204 B1). */
export function isSameRoomBedChangeFromLabels(input: {
  fromRoomLabel?: string | null;
  toRoomNumber?: string | null;
  fromRoomNumber?: string | null;
}): boolean {
  const toRoom = (input.toRoomNumber ?? '').trim();
  const fromRoom = (input.fromRoomNumber ?? '').trim();
  if (toRoom && fromRoom) return fromRoom === toRoom;
  if (!toRoom) return false;
  const fromLabel = input.fromRoomLabel ?? '';
  const patterns = [
    new RegExp(`\\bR\\s*0*${toRoom}\\b`, 'i'),
    new RegExp(`\\bRoom\\s*0*${toRoom}\\b`, 'i'),
    new RegExp(`(?:^|[·,\\s])0*${toRoom}\\b`),
  ];
  return patterns.some((re) => re.test(fromLabel));
}

/**
 * Same-room (or fee-only) payable: operator should see Bed/Room Change Fee — ₹90,
 * not a rent/deposit credit waterfall.
 */
export function isSimpleRoomChangeFeeReview(input: {
  amountPaise: number;
  sameRoom: boolean;
  shiftFeePaise?: number;
  feeDuePaise?: number;
  newRentDuePaise?: number;
  depositDuePaise?: number;
  oldRentDuePaise?: number;
  totalDuePaise?: number;
  invoiceSourceTable?: string | null;
  invoiceNotes?: string | null;
}): boolean {
  const fee = Math.max(0, input.shiftFeePaise ?? ROOM_SHIFT_FEE_PAISE);
  const amount = Math.max(0, input.amountPaise);
  if (fee <= 0 || amount !== fee) return false;
  if ((input.depositDuePaise ?? 0) > 0) return false;
  if ((input.oldRentDuePaise ?? 0) > 0) return false;

  const source = input.invoiceSourceTable ?? '';
  if (source === ROOM_CHANGE_INVOICE_SOURCE.fee) return true;
  if (source === ROOM_CHANGE_INVOICE_SOURCE.payAll && amount === fee) {
    return input.sameRoom || (input.totalDuePaise ?? amount) === fee;
  }

  // Historical quotes sometimes mis-bucketed the ₹90 fee into newRentDuePaise=fee
  // with feeDuePaise=0 after prepaid credit — still a simple fee for operators.
  const total = input.totalDuePaise ?? amount;
  if (input.sameRoom && total === fee) return true;

  const feeDue = input.feeDuePaise ?? 0;
  const newRentDue = input.newRentDuePaise ?? 0;
  if (feeDue === fee && newRentDue === 0 && total === fee) return true;
  if (input.sameRoom && feeDue === 0 && newRentDue === fee && total === fee) return true;

  const notes = (input.invoiceNotes ?? '').toLowerCase();
  if (input.sameRoom && (notes.includes('room change fee') || notes.includes('change bed'))) {
    return true;
  }

  return false;
}

export function paymentReviewPurposeLabel(
  purpose: PaymentReviewPurposeCode,
  opts?: { sameRoomBedChange?: boolean },
): string {
  switch (purpose) {
    case 'DEPOSIT_COLLECTION':
      return 'Deposit Collection';
    case 'RENT':
      return 'Rent';
    case 'ELECTRICITY':
      return 'Electricity';
    case 'ROOM_CHANGE_FEE':
      return opts?.sameRoomBedChange ? 'Bed Change Fee' : 'Room Change Fee';
    case 'ROOM_CHANGE_SETTLEMENT':
      return 'Room Change Settlement';
    case 'EXTENSION':
      return 'Extension';
    case 'COMBINED':
      return 'Combined Invoice';
    case 'BOOKING':
      return 'New Stay Payment';
    default:
      return 'Payment';
  }
}

export function resolvePaymentReviewPurpose(input: {
  kind: 'qr' | 'rent' | 'electricity' | 'extension' | 'deposit_link';
  amountPaise: number;
  invoiceType?: string | null;
  invoiceNotes?: string | null;
  invoiceSourceTable?: string | null;
  paymentLinkPurpose?: string | null;
  roomChange?: {
    sameRoom: boolean;
    shiftFeePaise?: number;
    feeDuePaise: number;
    newRentDuePaise: number;
    depositDuePaise: number;
    oldRentDuePaise?: number;
    totalDuePaise: number;
  } | null;
}): PaymentReviewPurposeResolution {
  if (input.kind === 'rent') {
    return {
      purpose: 'RENT',
      label: paymentReviewPurposeLabel('RENT'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }
  if (input.kind === 'electricity') {
    return {
      purpose: 'ELECTRICITY',
      label: paymentReviewPurposeLabel('ELECTRICITY'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }
  if (input.kind === 'extension') {
    return {
      purpose: 'EXTENSION',
      label: paymentReviewPurposeLabel('EXTENSION'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }
  if (input.kind === 'qr') {
    return {
      purpose: 'BOOKING',
      label: paymentReviewPurposeLabel('BOOKING'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }

  // deposit_link channel — classify from linked invoice / room-change quote.
  const sameRoom = input.roomChange?.sameRoom === true;
  const isRoomChangeInvoice =
    input.invoiceType === 'room_shift' ||
    isRoomChangeInvoiceSource(input.invoiceSourceTable) ||
    Boolean(input.roomChange && (input.invoiceSourceTable || input.invoiceType === 'room_shift'));

  const linkedToRoomChange =
    isRoomChangeInvoice ||
    (input.roomChange != null &&
      (input.paymentLinkPurpose === 'combined' ||
        isRoomChangeInvoiceSource(input.invoiceSourceTable)));

  if (linkedToRoomChange && input.roomChange) {
    const simple = isSimpleRoomChangeFeeReview({
      amountPaise: input.amountPaise,
      sameRoom,
      shiftFeePaise: input.roomChange.shiftFeePaise,
      feeDuePaise: input.roomChange.feeDuePaise,
      newRentDuePaise: input.roomChange.newRentDuePaise,
      depositDuePaise: input.roomChange.depositDuePaise,
      oldRentDuePaise: input.roomChange.oldRentDuePaise,
      totalDuePaise: input.roomChange.totalDuePaise,
      invoiceSourceTable: input.invoiceSourceTable,
      invoiceNotes: input.invoiceNotes,
    });
    if (simple) {
      return {
        purpose: 'ROOM_CHANGE_FEE',
        label: paymentReviewPurposeLabel('ROOM_CHANGE_FEE', { sameRoomBedChange: sameRoom }),
        showRoomChangeWaterfall: false,
        sameRoomBedChange: sameRoom,
      };
    }
    return {
      purpose: 'ROOM_CHANGE_SETTLEMENT',
      label: paymentReviewPurposeLabel('ROOM_CHANGE_SETTLEMENT'),
      showRoomChangeWaterfall: true,
      sameRoomBedChange: sameRoom,
    };
  }

  if (input.invoiceType === 'room_shift' || isRoomChangeInvoiceSource(input.invoiceSourceTable)) {
    const simple = isSimpleRoomChangeFeeReview({
      amountPaise: input.amountPaise,
      sameRoom,
      totalDuePaise: input.amountPaise,
      invoiceSourceTable: input.invoiceSourceTable,
      invoiceNotes: input.invoiceNotes,
    });
    return {
      purpose: simple ? 'ROOM_CHANGE_FEE' : 'ROOM_CHANGE_SETTLEMENT',
      label: paymentReviewPurposeLabel(simple ? 'ROOM_CHANGE_FEE' : 'ROOM_CHANGE_SETTLEMENT', {
        sameRoomBedChange: sameRoom,
      }),
      showRoomChangeWaterfall: !simple,
      sameRoomBedChange: sameRoom,
    };
  }

  if (input.invoiceType === 'deposit' || input.paymentLinkPurpose === 'deposit') {
    return {
      purpose: 'DEPOSIT_COLLECTION',
      label: paymentReviewPurposeLabel('DEPOSIT_COLLECTION'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }

  if (input.paymentLinkPurpose === 'combined') {
    return {
      purpose: 'COMBINED',
      label: paymentReviewPurposeLabel('COMBINED'),
      showRoomChangeWaterfall: false,
      sameRoomBedChange: false,
    };
  }

  return {
    purpose: 'DEPOSIT_COLLECTION',
    label: paymentReviewPurposeLabel('DEPOSIT_COLLECTION'),
    showRoomChangeWaterfall: false,
    sameRoomBedChange: false,
  };
}

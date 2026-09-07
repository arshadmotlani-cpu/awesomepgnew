import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';

export type FyhBusinessHoursDay = {
  dayOfWeek: number;
  open: string;
  close: string;
  closed?: boolean;
};

export type FyhCommunicationSettings = {
  whatsappInvoiceTemplate?: string;
  reviewRequestTemplate?: string;
};

export type FyhBillingSettings = {
  defaultMarkDue?: boolean;
  defaultMarkFullDue?: boolean;
  defaultCreditOverpayAsAdvance?: boolean;
  /** Cash drawer float at start of day (paise). */
  dailyClosingOpeningFloatPaise?: number;
  /** Contact email shown on customer invoices. */
  businessEmail?: string | null;
};

export type FyhPrinterSettings = {
  receiptWidthMm?: 58 | 80;
  autoPrint?: boolean;
};

export type FyhWhatsappSettings = {
  enabled?: boolean;
  businessPhone?: string | null;
};

export type FyhInventorySettings = {
  allowNegativeStock?: boolean;
};

export type FyhSecuritySettings = Record<string, never>;

export type FyhAttendanceSettings = {
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  officeRadiusMetres?: number;
  officeLabel?: string | null;
};

export const DEFAULT_ATTENDANCE_RADIUS_METRES = 50;

export const fyhSettings = pgTable(
  'fyh_settings',
  {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  organizationId: organizationIdCol(),
  businessName: text('business_name').notNull().default('For Your Hair'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  themeDefault: text('theme_default').notNull().default('dark'),
  businessAddress: text('business_address'),
  gstin: text('gstin'),
  invoicePrefix: text('invoice_prefix').notNull().default('FYH'),
  invoiceNextSeq: integer('invoice_next_seq').notNull().default(1),
  customerCodeNextSeq: integer('customer_code_next_seq').notNull().default(1),
  defaultGstBps: integer('default_gst_bps').notNull().default(1800),
  defaultBufferMinutes: integer('default_buffer_minutes').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  businessHours: jsonb('business_hours').$type<FyhBusinessHoursDay[]>(),
  googleReviewUrl: text('google_review_url'),
  invoiceNotes: text('invoice_notes'),
  communicationSettings: jsonb('communication_settings').$type<FyhCommunicationSettings>(),
  billingSettings: jsonb('billing_settings').$type<FyhBillingSettings>(),
  printerSettings: jsonb('printer_settings').$type<FyhPrinterSettings>(),
  whatsappSettings: jsonb('whatsapp_settings').$type<FyhWhatsappSettings>(),
  inventorySettings: jsonb('inventory_settings').$type<FyhInventorySettings>(),
  securitySettings: jsonb('security_settings').$type<FyhSecuritySettings>(),
  attendanceSettings: jsonb('attendance_settings').$type<FyhAttendanceSettings>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fyh_settings_org_uidx').on(t.organizationId)],
);

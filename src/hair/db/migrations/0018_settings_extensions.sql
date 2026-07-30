-- Phase H: tabbed settings — billing, printer, WhatsApp, security, invoice notes

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS invoice_notes text,
  ADD COLUMN IF NOT EXISTS billing_settings jsonb,
  ADD COLUMN IF NOT EXISTS printer_settings jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_settings jsonb,
  ADD COLUMN IF NOT EXISTS security_settings jsonb;

COMMENT ON COLUMN fyh_settings.invoice_notes IS 'Default footer/notes on customer invoices';
COMMENT ON COLUMN fyh_settings.billing_settings IS '{defaultMarkDue?, defaultMarkFullDue?, defaultCreditOverpayAsAdvance?}';
COMMENT ON COLUMN fyh_settings.printer_settings IS '{receiptWidthMm?: 58|80, autoPrint?: boolean}';
COMMENT ON COLUMN fyh_settings.whatsapp_settings IS '{enabled?: boolean, businessPhone?: string}';
COMMENT ON COLUMN fyh_settings.security_settings IS 'Reserved for Phase I admin CRUD';

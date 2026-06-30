ALTER TABLE "room_electricity_ledger_entries" ADD COLUMN IF NOT EXISTS "electricity_invoice_id" uuid;
--> statement-breakpoint
ALTER TABLE "room_electricity_ledger_entries" ADD CONSTRAINT "room_electricity_ledger_entries_electricity_invoice_id_electricity_invoices_id_fk" FOREIGN KEY ("electricity_invoice_id") REFERENCES "public"."electricity_invoices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_electricity_ledger_entries_invoice_unique" ON "room_electricity_ledger_entries" ("electricity_invoice_id");

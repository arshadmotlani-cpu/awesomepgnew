-- Automotive Capital migration 0002: integrity constraints and indexes

CREATE INDEX IF NOT EXISTS ac_auto_model_idx ON ac_automotive_details (manufacturer, model);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_expenses_category_idx ON ac_expenses (category_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_payments_received_at_idx ON ac_payments_received (received_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_ledger_source_idx ON ac_ledger_entries (source_table, source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_activity_action_created_idx ON ac_activity_log (action, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_activity_entity_idx ON ac_activity_log (entity_type, entity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ac_documents_asset_idx ON ac_documents (asset_id);
--> statement-breakpoint
ALTER TABLE ac_expenses DROP CONSTRAINT IF EXISTS ac_expenses_amount_positive;
--> statement-breakpoint
ALTER TABLE ac_expenses ADD CONSTRAINT ac_expenses_amount_positive CHECK (amount_paise > 0);
--> statement-breakpoint
ALTER TABLE ac_payments_received DROP CONSTRAINT IF EXISTS ac_payments_amount_positive;
--> statement-breakpoint
ALTER TABLE ac_payments_received ADD CONSTRAINT ac_payments_amount_positive CHECK (amount_paise > 0);
--> statement-breakpoint
ALTER TABLE ac_payments_received DROP CONSTRAINT IF EXISTS ac_payments_split;
--> statement-breakpoint
ALTER TABLE ac_payments_received ADD CONSTRAINT ac_payments_split CHECK (
  capital_returned_paise + profit_paise + adjustment_paise = amount_paise
);
--> statement-breakpoint
ALTER TABLE ac_capital_investments DROP CONSTRAINT IF EXISTS ac_capital_amount_positive;
--> statement-breakpoint
ALTER TABLE ac_capital_investments ADD CONSTRAINT ac_capital_amount_positive CHECK (amount_paise > 0);

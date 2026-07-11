-- Manual profits (non-vehicle investment returns) + ledger type

DO $$ BEGIN
  CREATE TYPE ac_manual_profit_category AS ENUM (
    'investment_return',
    'adjustment',
    'bonus',
    'settlement',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE ac_ledger_entry_type ADD VALUE IF NOT EXISTS 'manual_profit';

CREATE TABLE IF NOT EXISTS ac_manual_profits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_paise bigint NOT NULL,
  profit_date date NOT NULL,
  source text NOT NULL,
  description text NOT NULL,
  category ac_manual_profit_category NOT NULL,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ac_manual_profits_amount_positive CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS ac_manual_profits_date_idx ON ac_manual_profits (profit_date);
CREATE INDEX IF NOT EXISTS ac_manual_profits_category_idx ON ac_manual_profits (category);
CREATE INDEX IF NOT EXISTS ac_manual_profits_reversed_idx ON ac_manual_profits (is_reversed);

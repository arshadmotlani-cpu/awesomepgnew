ALTER TABLE room_electricity_ledger_entries
  ADD COLUMN IF NOT EXISTS note text;

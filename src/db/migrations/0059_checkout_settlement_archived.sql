-- Allow archiving checkout settlements without deleting audit history.
ALTER TYPE checkout_settlement_status ADD VALUE IF NOT EXISTS 'archived';

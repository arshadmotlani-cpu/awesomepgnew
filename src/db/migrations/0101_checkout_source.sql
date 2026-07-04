-- Checkout lifecycle source SSOT (resident vs admin emergency checkout).
ALTER TABLE checkout_settlements
  ADD COLUMN IF NOT EXISTS checkout_source text NOT NULL DEFAULT 'resident_vacating';

COMMENT ON COLUMN checkout_settlements.checkout_source IS
  'resident_vacating | admin_force_checkout | resident_checkout | emergency_checkout';

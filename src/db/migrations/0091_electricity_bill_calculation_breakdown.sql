ALTER TABLE electricity_bills
  ADD COLUMN IF NOT EXISTS calculation_breakdown jsonb;

COMMENT ON COLUMN electricity_bills.calculation_breakdown IS
  'Transparent room electricity calculation — meter, occupancy timeline, checkout credits, remaining balance.';

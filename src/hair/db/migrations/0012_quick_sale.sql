-- Quick Sale: customer codes, invoice source, tip/round-off

ALTER TABLE fyh_settings
  ADD COLUMN IF NOT EXISTS customer_code_next_seq integer NOT NULL DEFAULT 1;

ALTER TABLE fyh_customers
  ADD COLUMN IF NOT EXISTS customer_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM fyh_customers
  WHERE customer_code IS NULL
)
UPDATE fyh_customers AS c
SET customer_code = 'CL' || lpad(n.rn::text, 8, '0')
FROM numbered AS n
WHERE c.id = n.id;

UPDATE fyh_settings
SET customer_code_next_seq = GREATEST(
  customer_code_next_seq,
  COALESCE(
    (
      SELECT max(substring(customer_code from 3)::integer) + 1
      FROM fyh_customers
      WHERE customer_code ~ '^CL[0-9]+$'
    ),
    1
  )
)
WHERE id = (SELECT id FROM fyh_settings LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS fyh_customers_code_uidx
  ON fyh_customers (customer_code)
  WHERE customer_code IS NOT NULL;

ALTER TABLE fyh_invoices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'appointment',
  ADD COLUMN IF NOT EXISTS tip_paise bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off_paise bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN fyh_invoices.source IS 'appointment | quick_sale';
COMMENT ON COLUMN fyh_customers.customer_code IS 'Salon customer code e.g. CL00000174';

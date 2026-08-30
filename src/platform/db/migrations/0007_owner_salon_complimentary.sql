-- Represent the canonical For Your Hair tenant as a complimentary (₹0/year) SaaS customer.
-- No invoices or payment submissions are generated for complimentary subscriptions.

UPDATE platform.organization_subscriptions s
SET
  status = 'complimentary',
  current_period_end = NULL,
  updated_at = now()
FROM platform.organizations o
WHERE s.organization_id = o.id
  AND o.slug = 'for-your-hair'
  AND s.status IS DISTINCT FROM 'complimentary';

-- Grant Platform Administrator access to the ecosystem operator account.
-- Idempotent: does not create a duplicate user or touch organization memberships.

INSERT INTO platform.platform_memberships (user_id, role)
SELECT u.id, 'admin'
FROM platform.users u
WHERE lower(u.email) = 'admin@foryour.co'
  AND u.status = 'active'
ON CONFLICT DO NOTHING;

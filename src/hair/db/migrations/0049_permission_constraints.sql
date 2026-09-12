-- FYHAIR RBAC v2: per-grant constraint storage (max discount %, etc.)
ALTER TABLE wf_permission_grants
  ADD COLUMN IF NOT EXISTS max_discount_percent integer;

ALTER TABLE wf_role_templates
  ADD COLUMN IF NOT EXISTS max_discount_percent integer;

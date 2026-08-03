-- Room OS Wave 5 — DB-published rules store.

CREATE TABLE IF NOT EXISTS room_os_published_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL,
  version integer NOT NULL,
  scope text NOT NULL,
  scope_ref uuid,
  override_mode text NOT NULL,
  description text NOT NULL,
  fact_key text NOT NULL,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  content_digest text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL DEFAULT 'system',
  source_ref text NOT NULL DEFAULT '',
  supersedes_publication_id uuid REFERENCES room_os_published_rules (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_os_published_rules_rule_version_unique UNIQUE (rule_id, version),
  CONSTRAINT room_os_published_rules_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS room_os_published_rules_scope_status_idx
  ON room_os_published_rules (scope, scope_ref, status, effective_from);

CREATE INDEX IF NOT EXISTS room_os_published_rules_fact_key_idx
  ON room_os_published_rules (fact_key, status);

COMMENT ON TABLE room_os_published_rules IS
  'Append-only published Room OS rules — Wave 5 DB rule store.';

-- Bootstrap seed from RULES_CATALOG_V1 (Wave 0 code catalog).
INSERT INTO room_os_published_rules (
  rule_id,
  version,
  scope,
  scope_ref,
  override_mode,
  description,
  fact_key,
  outcome,
  status,
  effective_from,
  content_digest,
  published_by,
  source_ref
) VALUES
  (
    'global.electricity.require_meter_before_bill',
    1,
    'global',
    NULL,
    'replace',
    'Electricity bill generation requires a current meter reading.',
    'electricity.meterReadingState',
    '{"required":"current","blockReason":"missing_meter"}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    '160d71ca43cecef6d2185821badeacce89f55d9266bd0f6363581f3b06b96e99',
    'system',
    'rules-catalog-v1-seed'
  ),
  (
    'global.work_queue.proofs_first',
    1,
    'global',
    NULL,
    'replace',
    'Payment proofs bucket precedes overdue rent in work queue.',
    'work_queue.bucket_order',
    '{"order":["proofs","overdue_rent","rent_today","electricity","move_out","day_close"]}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    '857943c286911e02301eb90487a97834ba1533973d8b46a1d8bbaaa81293d4bc',
    'system',
    'rules-catalog-v1-seed'
  ),
  (
    'property.billing_month_anchor',
    1,
    'property',
    NULL,
    'merge',
    'Property billing month anchor for index materialization.',
    'billing.month_anchor',
    '{"anchorDay":1}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    '38c5d1bfad862ba9a56aaf95ae6c73d0478cd65a84b7edc7195e99f0c810332b',
    'system',
    'rules-catalog-v1-seed'
  ),
  (
    'room.electricity.occupant_mode',
    1,
    'room',
    NULL,
    'replace',
    'Room electricity occupant resolution mode.',
    'electricity.occupant_mode',
    '{"mode":"month"}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    'd2b8a4a850e518b8f9a6324aa7dde4217d640839f25951cdb89aa6a8e1cdbd3e',
    'system',
    'rules-catalog-v1-seed'
  ),
  (
    'bed.occupancy.active_only',
    1,
    'bed',
    NULL,
    'replace',
    'Bed Brain binds only active or vacating bookings.',
    'occupancy.residency_status',
    '{"allowed":["active","vacating"]}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    'c08423b8cb8fdd39b588a5f509f28b2b7fdaf9f1dbf5330c7a231aa487ec3009',
    'system',
    'rules-catalog-v1-seed'
  ),
  (
    'booking.deposit.before_move_out',
    1,
    'booking',
    NULL,
    'merge',
    'Deposit settlement must complete before move-out queue item clears.',
    'move_out.deposit_gate',
    '{"requireDepositSettled":true}'::jsonb,
    'active',
    '2026-01-01T00:00:00Z'::timestamptz,
    '6b86afc06ceb57d91abd589bbbf7a4ade4acec1c90990d83bd21cb2e9de27b25',
    'system',
    'rules-catalog-v1-seed'
  )
ON CONFLICT (rule_id, version) DO NOTHING;

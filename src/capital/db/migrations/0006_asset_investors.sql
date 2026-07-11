-- Multi-investor funding per vehicle (Layer 2)
-- Layer 1 (business): purchase / sale / expenses on ac_assets
-- Layer 2 (investment): who funded the purchase + their profit share

CREATE TABLE IF NOT EXISTS ac_asset_investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES ac_assets(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('me', 'investor_2', 'investor_3')),
  label text NOT NULL,
  invested_paise bigint NOT NULL CHECK (invested_paise >= 0),
  profit_paise bigint,
  profit_received_paise bigint NOT NULL DEFAULT 0,
  roi_bps integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, slot)
);

CREATE INDEX IF NOT EXISTS ac_asset_investors_asset_idx ON ac_asset_investors(asset_id);
CREATE INDEX IF NOT EXISTS ac_asset_investors_slot_idx ON ac_asset_investors(slot);

-- Backfill: assume historical deals were 100% funded by Me unless share % exists.
-- When partner share % was recorded, split capital by the same percentages.
INSERT INTO ac_asset_investors (asset_id, slot, label, invested_paise, profit_paise, roi_bps)
SELECT
  a.id,
  'me',
  'Me',
  CASE
    WHEN a.my_share_pct_bps IS NOT NULL AND a.my_share_pct_bps BETWEEN 0 AND 10000
      THEN ROUND(a.purchase_price_paise::numeric * a.my_share_pct_bps / 10000)::bigint
    ELSE a.purchase_price_paise
  END,
  a.my_share_paise,
  a.my_roi_bps
FROM ac_assets a
WHERE a.status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM ac_asset_investors i WHERE i.asset_id = a.id AND i.slot = 'me'
  );

INSERT INTO ac_asset_investors (asset_id, slot, label, invested_paise, profit_paise, roi_bps)
SELECT
  a.id,
  'investor_2',
  'Investor 2',
  CASE
    WHEN a.partner_share_pct_bps IS NOT NULL AND a.partner_share_pct_bps > 0
      THEN ROUND(a.purchase_price_paise::numeric * a.partner_share_pct_bps / 10000)::bigint
    ELSE 0
  END,
  COALESCE(a.partner_share_paise, 0),
  CASE
    WHEN a.partner_share_paise IS NOT NULL
      AND a.partner_share_pct_bps IS NOT NULL
      AND a.partner_share_pct_bps > 0
      AND a.purchase_price_paise > 0
      THEN ROUND(
        (a.partner_share_paise::numeric * 10000)
        / NULLIF(ROUND(a.purchase_price_paise::numeric * a.partner_share_pct_bps / 10000), 0)
      )::int
    ELSE NULL
  END
FROM ac_assets a
WHERE a.status <> 'cancelled'
  AND a.partner_share_pct_bps IS NOT NULL
  AND a.partner_share_pct_bps > 0
  AND NOT EXISTS (
    SELECT 1 FROM ac_asset_investors i WHERE i.asset_id = a.id AND i.slot = 'investor_2'
  );

-- Recompute my_roi_bps from MY invested capital (not full vehicle price)
UPDATE ac_assets a
SET
  my_roi_bps = CASE
    WHEN a.my_share_paise IS NOT NULL AND i.invested_paise > 0
      THEN ROUND((a.my_share_paise::numeric * 10000) / i.invested_paise)::int
    ELSE a.my_roi_bps
  END,
  business_roi_bps = CASE
    WHEN a.profit_paise IS NOT NULL AND a.purchase_price_paise > 0
      THEN ROUND((a.profit_paise::numeric * 10000) / a.purchase_price_paise)::int
    ELSE a.business_roi_bps
  END,
  roi_bps = CASE
    WHEN a.profit_paise IS NOT NULL AND a.purchase_price_paise > 0
      THEN ROUND((a.profit_paise::numeric * 10000) / a.purchase_price_paise)::int
    ELSE a.roi_bps
  END,
  updated_at = now()
FROM ac_asset_investors i
WHERE i.asset_id = a.id
  AND i.slot = 'me'
  AND a.profit_paise IS NOT NULL;

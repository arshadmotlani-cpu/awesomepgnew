-- Public website display name + explicit sort order (canonical name/slug unchanged).

ALTER TABLE pgs ADD COLUMN IF NOT EXISTS public_display_name text;
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS display_order integer;

-- IT PARK PG (Trimurti Nagar)
UPDATE pgs
SET
  public_display_name = 'IT PARK',
  display_order = 1
WHERE archived_at IS NULL
  AND (name ILIKE '%trimurti%' OR slug ILIKE '%trimurti%');

-- SHANTINAGAR - AWESOME PG
UPDATE pgs
SET display_order = 2
WHERE archived_at IS NULL
  AND (name ILIKE '%shantinagar%' OR slug ILIKE '%shantinagar%')
  AND display_order IS NULL;

-- CENTRAL AVENUE - AWESOME PG (male; exclude female property)
UPDATE pgs
SET
  public_display_name = COALESCE(public_display_name, 'CENTRAL AVENUE - AWESOME PG'),
  display_order = 3
WHERE archived_at IS NULL
  AND display_order IS NULL
  AND (
    name ILIKE '%central%avenue%'
    OR slug ILIKE '%central-avenue%'
    OR (
      name ILIKE '%central%'
      AND name NOT ILIKE '%female%'
      AND slug NOT ILIKE '%female%'
      AND slug NOT ILIKE '%shantinagar%'
      AND slug NOT ILIKE '%trimurti%'
    )
  );

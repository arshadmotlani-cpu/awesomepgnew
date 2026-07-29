-- Six service categories + legacy remap + GST default for new rows

UPDATE fyh_services SET category = 'Hair'
  WHERE category IN ('Hair Color', 'Hair Treatment', 'Barber', 'Other');

UPDATE fyh_services SET category = 'Skin' WHERE category = 'Spa';

UPDATE fyh_services SET category = 'Makeup' WHERE category = 'Bridal';

UPDATE fyh_services SET category = 'Hair'
  WHERE category IS NOT NULL
    AND category NOT IN (
      'Hair',
      'Skin',
      'Makeup',
      'Nails',
      'Academy',
      'Digital Production'
    );

DELETE FROM fyh_service_categories
  WHERE name NOT IN (
    'Hair',
    'Skin',
    'Makeup',
    'Nails',
    'Academy',
    'Digital Production'
  );

INSERT INTO fyh_service_categories (name, slug, is_system, display_order) VALUES
  ('Hair', 'hair', true, 1),
  ('Skin', 'skin', true, 2),
  ('Makeup', 'makeup', true, 3),
  ('Nails', 'nails', true, 4),
  ('Academy', 'academy', true, 5),
  ('Digital Production', 'digital-production', true, 6)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_system = true,
  display_order = EXCLUDED.display_order;

UPDATE fyh_service_categories SET display_order = 1, is_system = true WHERE slug = 'hair';
UPDATE fyh_service_categories SET display_order = 2, is_system = true WHERE slug = 'skin';
UPDATE fyh_service_categories SET display_order = 3, is_system = true WHERE slug = 'makeup';
UPDATE fyh_service_categories SET display_order = 4, is_system = true WHERE slug = 'nails';
UPDATE fyh_service_categories SET display_order = 5, is_system = true WHERE slug = 'academy';
UPDATE fyh_service_categories SET display_order = 6, is_system = true WHERE slug = 'digital-production';

ALTER TABLE fyh_services ALTER COLUMN gst_bps SET DEFAULT 1800;

-- Move-out date change pending approval → action_items + admin notifications
ALTER TYPE action_item_type ADD VALUE IF NOT EXISTS 'vacating_date_change';

-- Phase 12: stabilization query indexes
CREATE INDEX IF NOT EXISTS idx_action_items_status_type ON action_items (status, type);
CREATE INDEX IF NOT EXISTS idx_unresolved_actions_status_bucket ON unresolved_actions (status, action_type);
CREATE INDEX IF NOT EXISTS idx_notifications_admin_unread ON notifications (audience, user_id, is_read, is_archived) WHERE audience = 'admin';

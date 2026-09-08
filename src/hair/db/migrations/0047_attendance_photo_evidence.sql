-- Photo attendance evidence URL (blob reference — not inline binary).

ALTER TABLE wf_attendance
  ADD COLUMN IF NOT EXISTS clock_in_photo_url text;

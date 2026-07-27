-- Add receptionist admin role for front-desk collections (proofs + receipts).
ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'receptionist';

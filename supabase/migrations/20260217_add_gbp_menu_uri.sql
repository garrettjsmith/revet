-- Add menu_uri column to gbp_profiles for storing the business menu link
ALTER TABLE gbp_profiles ADD COLUMN IF NOT EXISTS menu_uri text;

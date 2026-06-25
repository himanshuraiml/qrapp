-- Add global QR scan open/close toggle to session_settings
-- When qr_scan_open = false, all students see "Scanning closed" instead of QR code

ALTER TABLE session_settings
  ADD COLUMN IF NOT EXISTS qr_scan_open boolean NOT NULL DEFAULT true;

-- Real-world TPO uploads contain free-text dates like "28th July 2026" which
-- Postgres cannot cast to DATE. Since assessment_date is display-only (never
-- used for date arithmetic/sorting), relax it to TEXT so bulk inserts never
-- fail on messy human-entered date formats.
ALTER TABLE placement_drive_students
  ALTER COLUMN assessment_date TYPE TEXT;

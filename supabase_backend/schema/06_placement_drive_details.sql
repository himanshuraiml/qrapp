-- ─────────────────────────────────────────
-- PLACEMENT DRIVE STUDENTS — RICH DETAILS
-- (Mobile, Assessment Date, Test Time, Slot, Venue — per-student, from TPO CSV)
-- ─────────────────────────────────────────

ALTER TABLE placement_drive_students
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS assessment_date DATE,
  ADD COLUMN IF NOT EXISTS test_time TEXT,
  ADD COLUMN IF NOT EXISTS slot TEXT,
  ADD COLUMN IF NOT EXISTS venue TEXT;

-- Tighten read access now that this table carries phone numbers.
-- Previously any authenticated user (including students) could read every row.
DROP POLICY IF EXISTS "placement_drive_students: authenticated read" ON placement_drive_students;

CREATE POLICY "placement_drive_students: admin faculty read all"
  ON placement_drive_students FOR SELECT
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Faculty'));

CREATE POLICY "placement_drive_students: student read own"
  ON placement_drive_students FOR SELECT
  USING (student_id = (SELECT student_id FROM profiles WHERE id = auth.uid()));

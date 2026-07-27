-- ─────────────────────────────────────────
-- PLACEMENT DRIVES & PLACEMENT ATTENDANCE
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placement_drives (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  title        TEXT NOT NULL,
  drive_date   DATE NOT NULL,
  venue        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Upcoming', 'Active', 'Completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER placement_drives_updated_at
  BEFORE UPDATE ON placement_drives
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ─────────────────────────────────────────
-- PLACEMENT DRIVE STUDENTS (Eligible & Attendance)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_drive_students (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drive_id       UUID NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  student_id     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Eligible' CHECK (status IN ('Eligible', 'Present', 'Absent')),
  marked_at      TIMESTAMPTZ,
  marked_by      UUID REFERENCES auth.users(id),
  marked_by_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (drive_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_pds_drive ON placement_drive_students(drive_id);
CREATE INDEX IF NOT EXISTS idx_pds_student ON placement_drive_students(student_id);
CREATE INDEX IF NOT EXISTS idx_pds_status ON placement_drive_students(drive_id, status);

-- RLS
ALTER TABLE placement_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_drive_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "placement_drives: authenticated read"
  ON placement_drives FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "placement_drives: admin write"
  ON placement_drives FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'Admin');

CREATE POLICY "placement_drive_students: authenticated read"
  ON placement_drive_students FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "placement_drive_students: admin and faculty modify"
  ON placement_drive_students FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Faculty')
  );

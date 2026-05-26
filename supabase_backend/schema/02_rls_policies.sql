-- Row Level Security for QR Attendance System

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_settings ENABLE ROW LEVEL SECURITY;

-- helper to avoid repeated sub-selects
CREATE OR REPLACE FUNCTION _my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────

-- Every user can read their own profile
CREATE POLICY "profiles: self read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read every profile
CREATE POLICY "profiles: admin read all"
  ON profiles FOR SELECT
  USING (_my_role() = 'Admin');

-- Admins can create profiles
CREATE POLICY "profiles: admin insert"
  ON profiles FOR INSERT
  WITH CHECK (_my_role() = 'Admin');

-- Admins can update any profile; users can update their own
CREATE POLICY "profiles: update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id OR _my_role() = 'Admin');

-- Only admins can delete
CREATE POLICY "profiles: admin delete"
  ON profiles FOR DELETE
  USING (_my_role() = 'Admin');


-- ─────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────

-- Faculty/Admin can insert
CREATE POLICY "attendance: faculty insert"
  ON attendance FOR INSERT
  WITH CHECK (_my_role() IN ('Faculty', 'Admin'));

-- Admin sees everything; Faculty sees what they marked
CREATE POLICY "attendance: staff read"
  ON attendance FOR SELECT
  USING (
    _my_role() = 'Admin'
    OR marked_by = auth.uid()
  );

-- Students see only their own records
CREATE POLICY "attendance: student read own"
  ON attendance FOR SELECT
  USING (
    student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
  );

-- Only admins can delete
CREATE POLICY "attendance: admin delete"
  ON attendance FOR DELETE
  USING (_my_role() = 'Admin');


-- ─────────────────────────────────────────
-- SESSION SETTINGS
-- ─────────────────────────────────────────

CREATE POLICY "session_settings: authenticated read"
  ON session_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "session_settings: admin update"
  ON session_settings FOR UPDATE
  USING (_my_role() = 'Admin');

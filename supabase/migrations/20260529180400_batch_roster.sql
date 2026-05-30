-- Migration: Deploy get_attendance_roster and get_batch_attendance_roster functions

-- ─────────────────────────────────────────
-- get_attendance_roster
-- Flat list of student active rosters + presence status on date & session
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_attendance_roster(
  p_date       DATE,
  p_session    TEXT    DEFAULT NULL,
  p_department TEXT    DEFAULT NULL,
  p_section    TEXT    DEFAULT NULL
)
RETURNS TABLE (
  student_id   TEXT,
  name         TEXT,
  department   TEXT,
  year         INTEGER,
  section      TEXT,
  present      BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.student_id,
    p.name,
    p.department,
    p.year,
    p.section,
    EXISTS (
      SELECT 1 
      FROM attendance a 
      WHERE a.student_id = p.student_id 
        AND a.date       = p_date 
        AND (p_session IS NULL OR a.session = p_session)
    ) AS present
  FROM profiles p
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND (p_department IS NULL OR p.department = p_department)
    AND (p_section IS NULL OR p.section = p_section)
  ORDER BY p.department, p.section, p.name;
END;
$$;


-- ─────────────────────────────────────────
-- get_batch_attendance_roster
-- Flat list of student active rosters + presence status on date & session batch-wise
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_batch_attendance_roster(
  p_date    DATE,
  p_session TEXT DEFAULT NULL,
  p_batch   TEXT DEFAULT NULL
)
RETURNS TABLE (
  student_id TEXT,
  name       TEXT,
  batch      TEXT,
  year       INTEGER,
  present    BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.student_id,
    p.name,
    p.batch,
    p.year,
    EXISTS (
      SELECT 1 
      FROM attendance a 
      WHERE a.student_id = p.student_id 
        AND a.date       = p_date 
        AND (p_session IS NULL OR a.session = p_session)
    ) AS present
  FROM profiles p
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch  IS NOT NULL
    AND p.batch  != ''
    AND (p_batch IS NULL OR p.batch = p_batch)
  ORDER BY p.batch, p.name;
END;
$$;

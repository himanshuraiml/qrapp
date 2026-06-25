-- Add qr_blocked field to batch roster RPC functions so the admin
-- batch-wise report can filter/display QR-blocked students.

-- get_batch_attendance_roster (single-session view)
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
  present    BOOLEAN,
  qr_blocked BOOLEAN
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
    ) AS present,
    COALESCE(p.qr_blocked, FALSE) AS qr_blocked
  FROM profiles p
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch  IS NOT NULL
    AND p.batch  != ''
    AND (p_batch IS NULL OR p.batch = p_batch)
  ORDER BY p.batch, p.name;
END;
$$;

-- get_batch_attendance_roster_multi (all-sessions view)
CREATE OR REPLACE FUNCTION get_batch_attendance_roster_multi(
  p_date  DATE,
  p_batch TEXT DEFAULT NULL
)
RETURNS TABLE (
  student_id   TEXT,
  name         TEXT,
  batch        TEXT,
  year         INTEGER,
  fn1_present  BOOLEAN,
  fn2_present  BOOLEAN,
  an1_present  BOOLEAN,
  an2_present  BOOLEAN,
  qr_blocked   BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.student_id,
    p.name,
    p.batch,
    p.year,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'FN1') AS fn1_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'FN2') AS fn2_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'AN1') AS an1_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'AN2') AS an2_present,
    COALESCE(p.qr_blocked, FALSE) AS qr_blocked
  FROM profiles p
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch  IS NOT NULL
    AND p.batch  != ''
    AND (p_batch IS NULL OR p.batch = p_batch)
  ORDER BY p.batch, p.name;
END;
$$;

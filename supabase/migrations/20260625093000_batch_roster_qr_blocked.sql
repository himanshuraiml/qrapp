-- Add qr_blocked field to batch roster RPC functions so the admin
-- batch-wise report can filter/display QR-blocked students.

DROP FUNCTION IF EXISTS get_batch_attendance_roster(date, text, text);
DROP FUNCTION IF EXISTS get_batch_attendance_roster_multi(date, text);

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


-- Re-create stats and history functions to include automatic QR blocking checks and fix batch/section leakage
CREATE OR REPLACE FUNCTION get_student_attendance_stats(
  p_student_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dept TEXT;
  v_sec  TEXT;
  v_year INTEGER;
  v_batch TEXT;
  v_present_count INTEGER;
  v_total_conducted INTEGER;
  v_absent_count INTEGER;
  v_attendance_pct NUMERIC;
BEGIN
  -- Perform check and update QR blocked status dynamically
  PERFORM check_and_update_student_qr_blocked(p_student_id);

  -- Get student profile details
  SELECT department, section, year, batch 
  INTO v_dept, v_sec, v_year, v_batch
  FROM profiles
  WHERE student_id = p_student_id AND role = 'Student'
  LIMIT 1;

  IF v_dept IS NULL THEN
    RETURN json_build_object(
      'present_count', 0,
      'total_conducted', 0,
      'absent_count', 0,
      'attendance_pct', 0
    );
  END IF;

  -- 1. Count of present sessions (scans of this student id)
  SELECT COUNT(*) INTO v_present_count
  FROM attendance
  WHERE student_id = p_student_id;

  -- 2. Count of total conducted sessions for their group
  SELECT COUNT(DISTINCT (date, session)) INTO v_total_conducted
  FROM attendance
  WHERE department = v_dept 
    AND year = v_year 
    AND (
      (v_batch IS NOT NULL AND v_batch != '' AND batch = v_batch)
      OR
      ((v_batch IS NULL OR v_batch = '') AND section = v_sec AND (batch IS NULL OR batch = ''))
    );

  -- 3. Calculate absent sessions
  v_absent_count := GREATEST(0, v_total_conducted - v_present_count);

  -- 4. Calculate attendance percentage
  IF v_total_conducted > 0 THEN
    v_attendance_pct := ROUND((v_present_count::NUMERIC / v_total_conducted) * 100, 1);
  ELSE
    v_attendance_pct := 0;
  END IF;

  RETURN json_build_object(
    'present_count', v_present_count,
    'total_conducted', v_total_conducted,
    'absent_count', v_absent_count,
    'attendance_pct', v_attendance_pct
  );
END;
$$;


CREATE OR REPLACE FUNCTION get_student_attendance_history(
  p_student_id TEXT
)
RETURNS TABLE (
  date            DATE,
  session         TEXT,
  present         BOOLEAN,
  marked_by_name  TEXT,
  "timestamp"     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dept TEXT;
  v_sec  TEXT;
  v_year INTEGER;
  v_batch TEXT;
BEGIN
  -- Perform check and update QR blocked status dynamically
  PERFORM check_and_update_student_qr_blocked(p_student_id);

  -- Get student profile details
  SELECT department, section, year, batch 
  INTO v_dept, v_sec, v_year, v_batch
  FROM profiles
  WHERE student_id = p_student_id AND role = 'Student'
  LIMIT 1;

  IF v_dept IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH conducted_sessions AS (
    -- Get all distinct conducted sessions for their class
    SELECT DISTINCT a.date, a.session
    FROM attendance a
    WHERE a.department = v_dept 
      AND a.year = v_year 
      AND (
        (v_batch IS NOT NULL AND v_batch != '' AND a.batch = v_batch)
        OR
        ((v_batch IS NULL OR v_batch = '') AND a.section = v_sec AND (a.batch IS NULL OR a.batch = ''))
      )
  )
  SELECT 
    cs.date,
    cs.session,
    EXISTS (
      SELECT 1 
      FROM attendance a 
      WHERE a.student_id = p_student_id 
        AND a.date = cs.date 
        AND a.session = cs.session
    ) AS present,
    (
      SELECT a.marked_by_name 
      FROM attendance a 
      WHERE a.student_id = p_student_id 
        AND a.date = cs.date 
        AND a.session = cs.session
      LIMIT 1
    ) AS marked_by_name,
    (
      SELECT a."timestamp" 
      FROM attendance a 
      WHERE a.student_id = p_student_id 
        AND a.date = cs.date 
        AND a.session = cs.session
      LIMIT 1
    ) AS "timestamp"
  FROM conducted_sessions cs
  ORDER BY cs.date DESC, cs.session DESC;
END;
$$;

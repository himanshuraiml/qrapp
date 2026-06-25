-- Migration: Add student attendance statistics and history functions
-- Created: 2026-06-03

-- ─────────────────────────────────────────
-- get_student_attendance_stats
-- Calculates the student's overall attendance percentage, sessions present,
-- sessions absent, and total sessions conducted for their class.
-- ─────────────────────────────────────────
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
  -- We count distinct (date, session) where attendance was taken matching their department and year,
  -- and either their batch (if they belong to one) or their section (without a batch).
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


-- ─────────────────────────────────────────
-- get_student_attendance_history
-- Fetches the complete list of conducted sessions for the student's class
-- and flags whether the student was present or absent in each.
-- ─────────────────────────────────────────
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

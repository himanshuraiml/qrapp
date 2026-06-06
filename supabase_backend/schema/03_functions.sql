-- PostgreSQL helper functions for QR Attendance System

-- ─────────────────────────────────────────
-- mark_attendance_safe
-- Atomic duplicate-check + insert
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_attendance_safe(
  p_student_id     TEXT,
  p_student_name   TEXT,
  p_department     TEXT,
  p_section        TEXT,
  p_year           INTEGER,
  p_batch          TEXT, -- Added parameter
  p_session        TEXT,
  p_marked_by      UUID,
  p_marked_by_name TEXT,
  p_date           DATE        DEFAULT CURRENT_DATE,
  p_timestamp      TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_time             TIME;
  v_fn1_start        TIME := '08:00'::TIME;
  v_fn1_end          TIME := '11:00'::TIME;
  v_fn2_start        TIME := '11:00'::TIME;
  v_fn2_end          TIME := '13:00'::TIME;
  v_an1_start        TIME := '13:00'::TIME;
  v_an1_end          TIME := '15:00'::TIME;
  v_an2_start        TIME := '15:00'::TIME;
  v_an2_end          TIME := '17:00'::TIME;
  v_target_session   TEXT;
  v_last_timestamp   TIMESTAMPTZ;
  v_last_id          UUID;
  v_gap_minutes      NUMERIC;
  v_new              UUID;
  v_cfg_enabled      BOOLEAN := TRUE;
BEGIN
  -- 1. Extract scan time in India Standard Time (IST)
  v_time := (p_timestamp AT TIME ZONE 'Asia/Kolkata')::TIME;

  -- 2. Fetch session settings configuration from the database if available
  SELECT COALESCE(fn1_start, '08:00'::TIME),
         COALESCE(fn1_end, '11:00'::TIME),
         COALESCE(fn2_start, '11:00'::TIME),
         COALESCE(fn2_end, '13:00'::TIME),
         COALESCE(an1_start, '13:00'::TIME),
         COALESCE(an1_end, '15:00'::TIME),
         COALESCE(an2_start, '15:00'::TIME),
         COALESCE(an2_end, '17:00'::TIME),
         COALESCE(enabled, TRUE)
  INTO   v_fn1_start, v_fn1_end, v_fn2_start, v_fn2_end, v_an1_start, v_an1_end, v_an2_start, v_an2_end, v_cfg_enabled
  FROM   session_settings
  WHERE  id = 1;

  -- 3. Determine target session based on time boundaries:
  IF v_time BETWEEN v_fn1_start AND v_fn1_end THEN
    v_target_session := 'FN1';
  ELSIF v_time BETWEEN v_fn2_start AND v_fn2_end THEN
    v_target_session := 'FN2';
  ELSIF v_time BETWEEN v_an1_start AND v_an1_end THEN
    v_target_session := 'AN1';
  ELSIF v_time BETWEEN v_an2_start AND v_an2_end THEN
    v_target_session := 'AN2';
  ELSE
    -- If outside defined sessions, check if enforcement is enabled
    IF v_cfg_enabled THEN
      RETURN json_build_object(
        'success', FALSE,
        'message', 'Scan outside of active session windows.'
      );
    ELSE
      -- Fallback to default 24h mapping if enforcement is disabled
      IF v_time < '13:00:00'::TIME THEN
        IF v_time < '11:00:00'::TIME THEN
          v_target_session := 'FN1';
        ELSE
          v_target_session := 'FN2';
        END IF;
      ELSE
        IF v_time < '15:00:00'::TIME THEN
          v_target_session := 'AN1';
        ELSE
          v_target_session := 'AN2';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 4. Find any existing check-in for this student today for the SAME target session
  SELECT id, timestamp INTO v_last_id, v_last_timestamp
  FROM   attendance
  WHERE  student_id = p_student_id
    AND  date       = p_date
    AND  session    = v_target_session
  LIMIT 1;

  -- 5. Check the 1.5-hour gap rule only if a scan for this specific session already exists
  IF v_last_id IS NOT NULL THEN
    v_gap_minutes := EXTRACT(EPOCH FROM (p_timestamp - v_last_timestamp)) / 60;

    IF v_gap_minutes < 90 THEN
      RETURN json_build_object(
        'success', FALSE,
        'message', 'Already marked (' || v_target_session || ' marked ' || ROUND(v_gap_minutes)::TEXT || 'm ago)',
        'id',      v_last_id
      );
    END IF;
  END IF;

  -- 6. Insert the record
  INSERT INTO attendance
    (student_id, student_name, department, section, year, batch,
     session, marked_by, marked_by_name, date, timestamp)
  VALUES
    (p_student_id, p_student_name, p_department, p_section, p_year, p_batch,
     v_target_session, p_marked_by, p_marked_by_name, p_date, p_timestamp)
  RETURNING id INTO v_new;

  RETURN json_build_object(
    'success', TRUE,
    'message', 'Marked successfully as ' || v_target_session,
    'id',      v_new,
    'session', v_target_session
  );
END;
$$;


-- ─────────────────────────────────────────
-- get_dashboard_stats
-- Aggregated stats for admin dashboard
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_students INTEGER;
  v_total_faculty  INTEGER;
  v_today_unique   INTEGER;
  v_today_scans    INTEGER;
  v_by_session     JSON;
  v_by_dept        JSON;
BEGIN
  SELECT COUNT(*) INTO v_total_students FROM profiles WHERE role='Student' AND status='Active';
  SELECT COUNT(*) INTO v_total_faculty  FROM profiles WHERE role='Faculty' AND status='Active';
  SELECT COUNT(DISTINCT student_id) INTO v_today_unique FROM attendance WHERE date=p_date;
  SELECT COUNT(*) INTO v_today_scans FROM attendance WHERE date=p_date;

  SELECT COALESCE(json_object_agg(session, cnt), '{}') INTO v_by_session
  FROM (
    SELECT session, COUNT(*) AS cnt
    FROM   attendance WHERE date = p_date
    GROUP  BY session
  ) s;

  SELECT COALESCE(json_agg(d ORDER BY d.scans DESC), '[]') INTO v_by_dept
  FROM (
    SELECT department,
           COUNT(DISTINCT student_id) AS students,
           COUNT(*) AS scans
    FROM   attendance WHERE date = p_date
    GROUP  BY department
  ) d;

  RETURN json_build_object(
    'total_students',   v_total_students,
    'total_faculty',    v_total_faculty,
    'today_attendance', v_today_unique,
    'today_scans',      v_today_scans,
    'attendance_pct',   CASE WHEN v_total_students > 0
                          THEN ROUND((v_today_unique::NUMERIC / v_total_students) * 100, 1)
                          ELSE 0 END,
    'by_session',       v_by_session,
    'by_department',    v_by_dept
  );
END;
$$;


-- ─────────────────────────────────────────
-- get_section_summary
-- Per-session breakdown by dept / section / year
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_section_summary(
  p_date       DATE    DEFAULT CURRENT_DATE,
  p_department TEXT    DEFAULT NULL
)
RETURNS TABLE (
  department      TEXT,
  section         TEXT,
  year            INTEGER,
  fn1_count       BIGINT,
  fn2_count       BIGINT,
  an1_count       BIGINT,
  an2_count       BIGINT,
  total_students  BIGINT,
  attendance_pct  NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.department,
    p.section,
    p.year,
    COUNT(CASE WHEN a.session='FN1' THEN 1 END),
    COUNT(CASE WHEN a.session='FN2' THEN 1 END),
    COUNT(CASE WHEN a.session='AN1' THEN 1 END),
    COUNT(CASE WHEN a.session='AN2' THEN 1 END),
    COUNT(DISTINCT p.id),
    CASE WHEN COUNT(DISTINCT p.id) > 0
      THEN ROUND((COUNT(DISTINCT a.student_id)::NUMERIC / COUNT(DISTINCT p.id)) * 100, 1)
      ELSE 0::NUMERIC
    END
  FROM profiles p
  LEFT JOIN attendance a
    ON  a.student_id = p.student_id
    AND a.date       = p_date
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND (p_department IS NULL OR p.department = p_department)
  GROUP BY p.department, p.section, p.year
  ORDER BY p.department, p.year, p.section;
END;
$$;


-- ─────────────────────────────────────────
-- get_current_session
-- Returns the active sub-session label (FN1/FN2/AN1/AN2)
-- based on IST time and session settings
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_current_session()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fn1_start        TIME := '08:00'::TIME;
  v_fn1_end          TIME := '11:00'::TIME;
  v_fn2_start        TIME := '11:00'::TIME;
  v_fn2_end          TIME := '13:00'::TIME;
  v_an1_start        TIME := '13:00'::TIME;
  v_an1_end          TIME := '15:00'::TIME;
  v_an2_start        TIME := '15:00'::TIME;
  v_an2_end          TIME := '17:00'::TIME;
  v_enabled          BOOLEAN := TRUE;
BEGIN
  v_now := (NOW() AT TIME ZONE 'Asia/Kolkata')::TIME;
  
  SELECT COALESCE(fn1_start, '08:00'::TIME),
         COALESCE(fn1_end, '11:00'::TIME),
         COALESCE(fn2_start, '11:00'::TIME),
         COALESCE(fn2_end, '13:00'::TIME),
         COALESCE(an1_start, '13:00'::TIME),
         COALESCE(an1_end, '15:00'::TIME),
         COALESCE(an2_start, '15:00'::TIME),
         COALESCE(an2_end, '17:00'::TIME),
         COALESCE(enabled, TRUE)
  INTO   v_fn1_start, v_fn1_end, v_fn2_start, v_fn2_end, v_an1_start, v_an1_end, v_an2_start, v_an2_end, v_enabled
  FROM   session_settings
  WHERE  id = 1;

  IF v_now BETWEEN v_fn1_start AND v_fn1_end THEN
    RETURN 'FN1';
  ELSIF v_now BETWEEN v_fn2_start AND v_fn2_end THEN
    RETURN 'FN2';
  ELSIF v_now BETWEEN v_an1_start AND v_an1_end THEN
    RETURN 'AN1';
  ELSIF v_now BETWEEN v_an2_start AND v_an2_end THEN
    RETURN 'AN2';
  ELSE
    IF NOT v_enabled THEN
      -- Fallback to default 24h mapping if enforcement is disabled
      IF v_now < '13:00:00'::TIME THEN
        IF v_now < '11:00:00'::TIME THEN
          RETURN 'FN1';
        ELSE
          RETURN 'FN2';
        END IF;
      ELSE
        IF v_now < '15:00:00'::TIME THEN
          RETURN 'AN1';
        ELSE
          RETURN 'AN2';
        END IF;
      END IF;
    ELSE
      RETURN NULL;
    END IF;
  END IF;
END;
$$;


-- ─────────────────────────────────────────
-- get_attendance_report
-- Filtered records for the reports page
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_attendance_report(
  p_date_from  DATE    DEFAULT NULL,
  p_date_to    DATE    DEFAULT NULL,
  p_department TEXT    DEFAULT NULL,
  p_section    TEXT    DEFAULT NULL,
  p_year       INTEGER DEFAULT NULL,
  p_session    TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  student_id     TEXT,
  student_name   TEXT,
  department     TEXT,
  section        TEXT,
  year           INTEGER,
  session        TEXT,
  date           DATE,
  marked_by_name TEXT,
  "timestamp"    TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.student_id, a.student_name,
    a.department, a.section, a.year,
    a.session, a.date, a.marked_by_name, a."timestamp"
  FROM attendance a
  WHERE
    (p_date_from  IS NULL OR a.date       >= p_date_from)
    AND (p_date_to    IS NULL OR a.date       <= p_date_to)
    AND (p_department IS NULL OR a.department  = p_department)
    AND (p_section    IS NULL OR a.section     = p_section)
    AND (p_year       IS NULL OR a.year        = p_year)
    AND (p_session    IS NULL OR a.session     = p_session)
  ORDER BY a.date DESC, a.department, a.section, a.session, a.student_name;
END;
$$;


-- ─────────────────────────────────────────
-- get_distinct_filters
-- Returns unique student departments and sections
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_distinct_filters()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_departments JSON;
  v_sections    JSON;
BEGIN
  SELECT COALESCE(json_agg(DISTINCT department), '[]') INTO v_departments
  FROM profiles
  WHERE role = 'Student' AND department IS NOT NULL AND department != '';

  SELECT COALESCE(json_agg(DISTINCT section), '[]') INTO v_sections
  FROM profiles
  WHERE role = 'Student' AND section IS NOT NULL AND section != '';

  RETURN json_build_object(
    'departments', v_departments,
    'sections', v_sections
  );
END;
$$;


-- ─────────────────────────────────────────
-- get_batch_summary
-- Per-batch present count for a given date.
-- present = distinct students in the batch with ≥1 scan that day.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_batch_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  batch          TEXT,
  total_students BIGINT,
  present_count  BIGINT,
  attendance_pct NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.batch,
    COUNT(DISTINCT p.id),
    COUNT(DISTINCT a.student_id),
    CASE WHEN COUNT(DISTINCT p.id) > 0
      THEN ROUND((COUNT(DISTINCT a.student_id)::NUMERIC / COUNT(DISTINCT p.id)) * 100, 1)
      ELSE 0::NUMERIC
    END
  FROM profiles p
  LEFT JOIN attendance a
    ON  a.student_id = p.student_id
    AND a.date       = p_date
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch IS NOT NULL
    AND p.batch != ''
  GROUP BY p.batch
  ORDER BY p.batch;
END;
$$;


-- ─────────────────────────────────────────
-- get_batch_summary_range
-- Per-batch detailed summaries over a date range.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_batch_summary_range(
  p_date_from DATE,
  p_date_to   DATE
)
RETURNS TABLE (
  batch           TEXT,
  fn1_count       NUMERIC,
  fn2_count       NUMERIC,
  an1_count       NUMERIC,
  an2_count       NUMERIC,
  total_students  BIGINT,
  present_count   NUMERIC,
  attendance_pct  NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_days INTEGER;
BEGIN
  -- Count number of days in the range that have scans
  SELECT COUNT(DISTINCT date) INTO v_days
  FROM   attendance
  WHERE  date >= p_date_from AND date <= p_date_to;
  
  IF v_days IS NULL OR v_days = 0 THEN
    v_days := 1;
  END IF;

  RETURN QUERY
  SELECT
    p.batch,
    ROUND(COUNT(CASE WHEN a.session='FN1' THEN 1 END)::NUMERIC / v_days, 1) as fn1_count,
    ROUND(COUNT(CASE WHEN a.session='FN2' THEN 1 END)::NUMERIC / v_days, 1) as fn2_count,
    ROUND(COUNT(CASE WHEN a.session='AN1' THEN 1 END)::NUMERIC / v_days, 1) as an1_count,
    ROUND(COUNT(CASE WHEN a.session='AN2' THEN 1 END)::NUMERIC / v_days, 1) as an2_count,
    COUNT(DISTINCT p.id) as total_students,
    ROUND(COUNT(DISTINCT a.student_id || ':' || a.date)::NUMERIC / v_days, 1) as present_count,
    CASE WHEN COUNT(DISTINCT p.id) > 0
      THEN ROUND((COUNT(DISTINCT a.student_id || ':' || a.date)::NUMERIC / (COUNT(DISTINCT p.id) * v_days)) * 100, 1)
      ELSE 0::NUMERIC
    END as attendance_pct
  FROM profiles p
  LEFT JOIN attendance a
    ON  a.student_id = p.student_id
    AND a.date       >= p_date_from
    AND a.date       <= p_date_to
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch  IS NOT NULL
    AND p.batch  != ''
  GROUP BY p.batch
  ORDER BY p.batch;
END;
$$;


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


-- get_attendance_roster_multi
-- One row per student with per-session presence booleans for "All Sessions" view
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_attendance_roster_multi(
  p_date       DATE,
  p_department TEXT DEFAULT NULL,
  p_section    TEXT DEFAULT NULL
)
RETURNS TABLE (
  student_id   TEXT,
  name         TEXT,
  department   TEXT,
  year         INTEGER,
  section      TEXT,
  fn1_present  BOOLEAN,
  fn2_present  BOOLEAN,
  an1_present  BOOLEAN,
  an2_present  BOOLEAN
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
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'FN1') AS fn1_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'FN2') AS fn2_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'AN1') AS an1_present,
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'AN2') AS an2_present
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


-- get_batch_attendance_roster_multi
-- One row per student with per-session presence booleans for "All Sessions" view
-- ─────────────────────────────────────────
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
  an2_present  BOOLEAN
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
    EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date AND a.session = 'AN2') AS an2_present
  FROM profiles p
  WHERE p.role   = 'Student'
    AND p.status = 'Active'
    AND p.batch  IS NOT NULL
    AND p.batch  != ''
    AND (p_batch IS NULL OR p.batch = p_batch)
  ORDER BY p.batch, p.name;
END;
$$;


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
  -- and either their section or their batch (if they belong to a batch).
  SELECT COUNT(DISTINCT (date, session)) INTO v_total_conducted
  FROM attendance
  WHERE department = v_dept 
    AND year = v_year 
    AND (
      section = v_sec 
      OR (batch IS NOT NULL AND batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
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
        a.section = v_sec 
        OR (a.batch IS NOT NULL AND a.batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
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




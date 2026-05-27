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
  p_session        TEXT,
  p_marked_by      UUID,
  p_marked_by_name TEXT,
  p_date           DATE        DEFAULT CURRENT_DATE,
  p_timestamp      TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hour             INTEGER;
  v_prefix           TEXT;
  v_last_timestamp   TIMESTAMPTZ;
  v_last_id          UUID;
  v_last_session     TEXT;
  v_count            INTEGER;
  v_target_session   TEXT;
  v_gap_minutes      NUMERIC;
  v_new              UUID;
BEGIN
  -- 1. Determine whether it is Forenoon (FN) or Afternoon (AN) based on timestamp in IST
  v_hour := EXTRACT(HOUR FROM p_timestamp AT TIME ZONE 'Asia/Kolkata');
  
  IF v_hour < 12 THEN
    v_prefix := 'FN';
  ELSE
    v_prefix := 'AN';
  END IF;

  -- 2. Find the most recent scan for this student today within the same half-day (FN or AN)
  SELECT id, timestamp, session INTO v_last_id, v_last_timestamp, v_last_session
  FROM   attendance
  WHERE  student_id = p_student_id
    AND  date       = p_date
    AND  session    LIKE v_prefix || '%'
  ORDER BY timestamp DESC
  LIMIT 1;

  -- 3. If there is a previous scan, check the 1-hour gap rule
  IF v_last_id IS NOT NULL THEN
    v_gap_minutes := EXTRACT(EPOCH FROM (p_timestamp - v_last_timestamp)) / 60;
    
    IF v_gap_minutes < 60 THEN
      RETURN json_build_object(
        'success', FALSE,
        'message', 'Already marked (' || v_last_session || ' marked ' || ROUND(v_gap_minutes)::TEXT || 'm ago)',
        'id',      v_last_id
      );
    END IF;
  END IF;

  -- 4. Determine next sub-session number (1, 2, or 3)
  SELECT COUNT(DISTINCT session) INTO v_count
  FROM   attendance
  WHERE  student_id = p_student_id
    AND  date       = p_date
    AND  session    LIKE v_prefix || '%';

  IF v_count >= 3 THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Maximum ' || v_prefix || ' sessions already marked for today'
    );
  END IF;

  v_target_session := v_prefix || (v_count + 1)::TEXT;

  -- 5. Insert the record
  INSERT INTO attendance
    (student_id, student_name, department, section, year,
     session, marked_by, marked_by_name, date, timestamp)
  VALUES
    (p_student_id, p_student_name, p_department, p_section, p_year,
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
  fn3_count       BIGINT,
  an1_count       BIGINT,
  an2_count       BIGINT,
  an3_count       BIGINT,
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
    COUNT(CASE WHEN a.session='FN3' THEN 1 END),
    COUNT(CASE WHEN a.session='AN1' THEN 1 END),
    COUNT(CASE WHEN a.session='AN2' THEN 1 END),
    COUNT(CASE WHEN a.session='AN3' THEN 1 END),
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
-- Returns the active sub-session label (FN1/FN2/.../AN3)
-- based on IST time and session settings
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_current_session()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_now    TIME;
  v_cfg    RECORD;
  v_prefix TEXT;
  v_used   INTEGER;
BEGIN
  v_now := (NOW() AT TIME ZONE 'Asia/Kolkata')::TIME;
  SELECT * INTO v_cfg FROM session_settings WHERE id = 1;

  IF NOT v_cfg.enabled THEN RETURN NULL; END IF;

  IF v_now BETWEEN v_cfg.morning_start   AND v_cfg.morning_end   THEN v_prefix := 'FN';
  ELSIF v_now BETWEEN v_cfg.afternoon_start AND v_cfg.afternoon_end THEN v_prefix := 'AN';
  ELSE RETURN NULL;
  END IF;

  SELECT COUNT(DISTINCT session) INTO v_used
  FROM   attendance
  WHERE  date    = (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
    AND  session LIKE v_prefix || '%';

  IF v_used >= 3 THEN RETURN v_prefix || '3'; END IF;
  RETURN v_prefix || (v_used + 1)::TEXT;
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

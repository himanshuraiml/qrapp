-- ═══════════════════════════════════════════════════════════════
-- Migration 13: CDC Classes Module — 8-Period Timetable & Attendance
--
-- Mirrors the existing Training attendance system's security model
-- (see 08_security_hardening.sql, 09_reporting_rpc_rbac.sql):
--   - Attendance rows are never insertable directly by clients; only via
--     a SECURITY DEFINER RPC that derives the marker from auth.uid().
--   - Every reporting RPC is revoked from PUBLIC/anon and re-checks the
--     caller's role/ownership internally (RLS is bypassed by
--     SECURITY DEFINER, so this check is the only gate).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- CDC TIMETABLE (admin-configurable subject per period per weekday)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdc_timetable (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday .. 6=Saturday
  period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 8),
  subject       TEXT,
  faculty_name  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (day_of_week, period_number)
);

ALTER TABLE cdc_timetable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdc_timetable: authenticated read"
  ON cdc_timetable FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "cdc_timetable: admin write"
  ON cdc_timetable FOR ALL
  USING (_my_role() = 'Admin');

CREATE TRIGGER cdc_timetable_updated_at
  BEFORE UPDATE ON cdc_timetable
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();


-- ─────────────────────────────────────────
-- CDC ATTENDANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cdc_attendance (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      TEXT        NOT NULL,
  student_name    TEXT        NOT NULL,
  department      TEXT        NOT NULL,
  section         TEXT        NOT NULL,
  year            INTEGER     NOT NULL CHECK (year BETWEEN 1 AND 4),
  batch           TEXT,
  period_number   INTEGER     NOT NULL CHECK (period_number BETWEEN 1 AND 8),
  subject         TEXT,
  marked_by       UUID        NOT NULL REFERENCES auth.users(id),
  marked_by_name  TEXT        NOT NULL,
  date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, date, period_number)
);

CREATE INDEX IF NOT EXISTS idx_cdc_att_date      ON cdc_attendance(date);
CREATE INDEX IF NOT EXISTS idx_cdc_att_student   ON cdc_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_cdc_att_dept      ON cdc_attendance(department, section, year);
CREATE INDEX IF NOT EXISTS idx_cdc_att_period    ON cdc_attendance(period_number, date);
CREATE INDEX IF NOT EXISTS idx_cdc_att_marked_by ON cdc_attendance(marked_by);

ALTER TABLE cdc_attendance ENABLE ROW LEVEL SECURITY;

-- Direct INSERT is revoked — rows are only created via mark_cdc_attendance_safe.
REVOKE INSERT ON TABLE cdc_attendance FROM authenticated, anon, PUBLIC;

CREATE POLICY "cdc_attendance: staff read"
  ON cdc_attendance FOR SELECT
  USING (
    _my_role() = 'Admin'
    OR marked_by = auth.uid()
  );

CREATE POLICY "cdc_attendance: student read own"
  ON cdc_attendance FOR SELECT
  USING (
    student_id = (SELECT student_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "cdc_attendance: admin delete"
  ON cdc_attendance FOR DELETE
  USING (_my_role() = 'Admin');


-- ─────────────────────────────────────────
-- get_cdc_current_period — mirrors get_current_session, but resolves one
-- of 8 configurable periods instead of FN/AN sessions.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cdc_current_period(p_timestamp TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_now TIME;
  v_periods TIME[16];
  i INTEGER;
BEGIN
  v_now := ((COALESCE(p_timestamp, NOW())) AT TIME ZONE 'Asia/Kolkata')::TIME;

  SELECT ARRAY[
    COALESCE(p1_start, '09:00'::TIME), COALESCE(p1_end, '09:50'::TIME),
    COALESCE(p2_start, '09:50'::TIME), COALESCE(p2_end, '10:40'::TIME),
    COALESCE(p3_start, '10:50'::TIME), COALESCE(p3_end, '11:40'::TIME),
    COALESCE(p4_start, '11:40'::TIME), COALESCE(p4_end, '12:30'::TIME),
    COALESCE(p5_start, '13:20'::TIME), COALESCE(p5_end, '14:10'::TIME),
    COALESCE(p6_start, '14:10'::TIME), COALESCE(p6_end, '15:00'::TIME),
    COALESCE(p7_start, '15:10'::TIME), COALESCE(p7_end, '16:00'::TIME),
    COALESCE(p8_start, '16:00'::TIME), COALESCE(p8_end, '16:50'::TIME)
  ]
  INTO v_periods
  FROM session_settings WHERE id = 1;

  FOR i IN 1..8 LOOP
    IF v_now BETWEEN v_periods[(i - 1) * 2 + 1] AND v_periods[(i - 1) * 2 + 2] THEN
      RETURN i;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION get_cdc_current_period() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cdc_current_period() TO authenticated;


-- ─────────────────────────────────────────
-- mark_cdc_attendance_safe — mirrors mark_attendance_safe's hardening:
-- marker identity strictly from auth.uid(), Faculty/Admin Active only,
-- target student must be an Active student, period derived from
-- session_settings time windows (never client-supplied).
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_cdc_attendance_safe(
  p_student_id     TEXT,
  p_student_name   TEXT,
  p_department     TEXT,
  p_section        TEXT,
  p_year           INTEGER,
  p_batch          TEXT,
  p_date           DATE        DEFAULT CURRENT_DATE,
  p_timestamp      TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_marker_id              UUID;
  v_marker_role            TEXT;
  v_marker_status          TEXT;
  v_marker_name            TEXT;
  v_faculty_batch          TEXT;
  v_special_login          BOOLEAN := FALSE;
  v_restrict_faculty_batch BOOLEAN := FALSE;
  v_student_status         TEXT;
  v_target_period          INTEGER;
  v_subject                TEXT;
  v_existing_id             UUID;
  v_new                    UUID;
BEGIN
  v_marker_id := auth.uid();
  IF v_marker_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Unauthorized: sign in as Faculty or Admin to mark attendance.');
  END IF;

  SELECT role, status, name, COALESCE(batch, ''), COALESCE(special_login, FALSE)
  INTO   v_marker_role, v_marker_status, v_marker_name, v_faculty_batch, v_special_login
  FROM   profiles
  WHERE  id = v_marker_id;

  IF v_marker_role IS NULL OR v_marker_role NOT IN ('Faculty', 'Admin') THEN
    RETURN json_build_object('success', FALSE, 'message', 'Forbidden: only Faculty or Admin accounts can mark attendance.');
  END IF;

  IF v_marker_status = 'Inactive' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Restricted: Marker account is deactivated.');
  END IF;

  SELECT status INTO v_student_status
  FROM   profiles
  WHERE  student_id = p_student_id AND role = 'Student';

  IF v_student_status IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Restricted: Student profile not found.');
  ELSIF v_student_status = 'Inactive' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Restricted: Student account is deactivated.');
  END IF;

  SELECT COALESCE(restrict_faculty_batch, FALSE) INTO v_restrict_faculty_batch
  FROM session_settings WHERE id = 1;

  IF v_restrict_faculty_batch AND v_marker_role = 'Faculty' AND NOT v_special_login THEN
    IF v_faculty_batch IS NULL OR v_faculty_batch = '' THEN
      RETURN json_build_object('success', FALSE, 'message', 'Restricted: Assign a batch in your dashboard first.');
    END IF;
    IF p_batch IS NULL OR p_batch = '' OR p_batch != v_faculty_batch THEN
      RETURN json_build_object('success', FALSE, 'message', 'Restricted: You can only mark Batch ' || v_faculty_batch || ' (Student is Batch ' || COALESCE(p_batch, 'None') || ')');
    END IF;
  END IF;

  v_target_period := get_cdc_current_period(p_timestamp);
  IF v_target_period IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Scan outside of any active CDC period window.');
  END IF;

  SELECT id INTO v_existing_id
  FROM   cdc_attendance
  WHERE  student_id = p_student_id AND date = p_date AND period_number = v_target_period
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Already marked for Period ' || v_target_period, 'id', v_existing_id, 'period_number', v_target_period);
  END IF;

  SELECT subject INTO v_subject
  FROM   cdc_timetable
  WHERE  day_of_week = EXTRACT(DOW FROM p_date)::INTEGER AND period_number = v_target_period;

  INSERT INTO cdc_attendance
    (student_id, student_name, department, section, year, batch,
     period_number, subject, marked_by, marked_by_name, date, timestamp)
  VALUES
    (p_student_id, p_student_name, p_department, p_section, p_year, p_batch,
     v_target_period, v_subject, v_marker_id, v_marker_name, p_date, p_timestamp)
  RETURNING id INTO v_new;

  RETURN json_build_object(
    'success', TRUE,
    'message', 'Marked Present — Period ' || v_target_period || COALESCE(' (' || v_subject || ')', ''),
    'id', v_new,
    'period_number', v_target_period,
    'subject', v_subject
  );
END;
$$;

REVOKE ALL ON FUNCTION mark_cdc_attendance_safe(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, DATE, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_cdc_attendance_safe(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, DATE, TIMESTAMPTZ) TO authenticated;


-- ─────────────────────────────────────────
-- Reporting RPCs — staff-only (mirrors 09_reporting_rpc_rbac.sql pattern)
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cdc_dashboard_stats(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_period  INTEGER;
  v_total_students  BIGINT;
  v_present_today   BIGINT;
BEGIN
  IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF;

  v_current_period := get_cdc_current_period();

  SELECT COUNT(*) INTO v_total_students FROM profiles WHERE role = 'Student' AND status = 'Active';
  SELECT COUNT(DISTINCT student_id) INTO v_present_today FROM cdc_attendance WHERE date = p_date;

  RETURN json_build_object(
    'current_period', v_current_period,
    'total_students', v_total_students,
    'present_today', v_present_today,
    'attendance_pct', CASE WHEN v_total_students > 0 THEN ROUND((v_present_today::NUMERIC / v_total_students) * 100, 1) ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cdc_period_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(period_number INTEGER, subject TEXT, present_count BIGINT, total_students BIGINT, attendance_pct NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF;

  RETURN QUERY
  WITH periods AS (SELECT generate_series(1, 8) AS period_number),
       total AS (SELECT COUNT(*) AS cnt FROM profiles WHERE role = 'Student' AND status = 'Active')
  SELECT
    per.period_number,
    (SELECT t.subject FROM cdc_timetable t
      WHERE t.day_of_week = EXTRACT(DOW FROM p_date)::INTEGER AND t.period_number = per.period_number),
    COUNT(DISTINCT a.student_id),
    total.cnt,
    CASE WHEN total.cnt > 0 THEN ROUND((COUNT(DISTINCT a.student_id)::NUMERIC / total.cnt) * 100, 1) ELSE 0::NUMERIC END
  FROM periods per
  CROSS JOIN total
  LEFT JOIN cdc_attendance a ON a.period_number = per.period_number AND a.date = p_date
  GROUP BY per.period_number, total.cnt
  ORDER BY per.period_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cdc_student_history(p_student_id TEXT)
RETURNS TABLE(date DATE, period_number INTEGER, subject TEXT, marked_by_name TEXT, "timestamp" TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF _my_role() NOT IN ('Faculty', 'Admin') AND p_student_id IS DISTINCT FROM (SELECT student_id FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT a.date, a.period_number, a.subject, a.marked_by_name, a."timestamp"
  FROM cdc_attendance a
  WHERE a.student_id = p_student_id
  ORDER BY a.date DESC, a.period_number DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cdc_attendance_roster(p_date DATE, p_period INTEGER)
RETURNS TABLE(student_id TEXT, name TEXT, department TEXT, section TEXT, year INTEGER, batch TEXT, present BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF;

  RETURN QUERY
  SELECT
    p.student_id, p.name, p.department, p.section, p.year, p.batch,
    EXISTS (
      SELECT 1 FROM cdc_attendance a
      WHERE a.student_id = p.student_id AND a.date = p_date AND a.period_number = p_period
    ) AS present
  FROM profiles p
  WHERE p.role = 'Student' AND p.status = 'Active'
  ORDER BY p.department, p.section, p.name;
END;
$$;

REVOKE ALL ON FUNCTION get_cdc_dashboard_stats(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_cdc_period_summary(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_cdc_student_history(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_cdc_attendance_roster(DATE, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION get_cdc_dashboard_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cdc_period_summary(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cdc_student_history(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cdc_attendance_roster(DATE, INTEGER) TO authenticated;

INSERT INTO cdc_timetable (day_of_week, period_number, subject)
SELECT d, p, NULL
FROM generate_series(1, 5) AS d, generate_series(1, 8) AS p
ON CONFLICT (day_of_week, period_number) DO NOTHING;

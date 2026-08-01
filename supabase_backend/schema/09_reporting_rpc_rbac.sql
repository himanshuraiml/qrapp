-- ═══════════════════════════════════════════════════════════════
-- Reporting/roster RPC lockdown
--
-- Discovered while patching mark_attendance_safe: EVERY SECURITY DEFINER
-- function in this schema (all dashboard/report/roster RPCs, plus a dead
-- legacy overload of mark_attendance_safe) was executable by the `anon`
-- role -- i.e. by anyone holding the public anon key, with zero login
-- required. Since these bypass RLS by design (SECURITY DEFINER), the
-- entire student/faculty roster and attendance history was scrapeable by
-- an unauthenticated visitor -- a more severe version of VAPT Vuln 8.1
-- (the report assumed an authenticated Admin session was required).
--
-- Fix: revoke PUBLIC execute (removing anon access) on every function
-- below, grant to `authenticated` only, and add an internal role/
-- ownership check so a logged-in Student can't call staff-only reporting
-- RPCs directly, nor look up another student's individual attendance
-- history/stats (IDOR).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_distinct_filters()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_departments JSON;
  v_sections    JSON;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_section_summary(p_date date DEFAULT CURRENT_DATE, p_department text DEFAULT NULL::text)
 RETURNS TABLE(department text, section text, year integer, fn1_count bigint, fn2_count bigint, fn3_count bigint, an1_count bigint, an2_count bigint, an3_count bigint, total_students bigint, attendance_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_batch_attendance_roster(p_date date, p_session text DEFAULT NULL::text, p_batch text DEFAULT NULL::text)
 RETURNS TABLE(student_id text, name text, batch text, year integer, present boolean, qr_blocked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_unified_student_roster(p_date_from date, p_date_to date, p_department text DEFAULT NULL::text, p_section text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_batch text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_attendance_filter text DEFAULT NULL::text)
 RETURNS TABLE(student_id text, name text, department text, year integer, section text, batch text, qr_blocked boolean, fn1_present boolean, fn2_present boolean, an1_present boolean, an2_present boolean, range_present bigint, range_conducted bigint, range_absent bigint, range_pct numeric, overall_present bigint, overall_conducted bigint, overall_absent bigint, overall_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
  RETURN QUERY
  WITH 
  range_batch_conducted AS (
    SELECT 
      p.department,
      p.year,
      p.batch,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM profiles p
    JOIN attendance a ON a.student_id = p.student_id
    WHERE p.role = 'Student' AND p.status = 'Active'
      AND p.batch IS NOT NULL AND p.batch != ''
      AND a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY p.department, p.year, p.batch
  ),
  range_section_conducted AS (
    SELECT 
      p.department,
      p.year,
      p.section,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM profiles p
    JOIN attendance a ON a.student_id = p.student_id
    WHERE p.role = 'Student' AND p.status = 'Active'
      AND (p.batch IS NULL OR p.batch = '')
      AND a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY p.department, p.year, p.section
  ),
  range_student_presents AS (
    SELECT 
      a.student_id,
      COUNT(*)::BIGINT AS present_count
    FROM attendance a
    WHERE a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY a.student_id
  ),
  overall_batch_conducted AS (
    SELECT 
      p.department,
      p.year,
      p.batch,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM profiles p
    JOIN attendance a ON a.student_id = p.student_id
    WHERE p.role = 'Student' AND p.status = 'Active'
      AND p.batch IS NOT NULL AND p.batch != ''
    GROUP BY p.department, p.year, p.batch
  ),
  overall_section_conducted AS (
    SELECT 
      p.department,
      p.year,
      p.section,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM profiles p
    JOIN attendance a ON a.student_id = p.student_id
    WHERE p.role = 'Student' AND p.status = 'Active'
      AND (p.batch IS NULL OR p.batch = '')
    GROUP BY p.department, p.year, p.section
  ),
  overall_student_presents AS (
    SELECT 
      a.student_id,
      COUNT(*)::BIGINT AS present_count
    FROM attendance a
    GROUP BY a.student_id
  ),
  daily_presence AS (
    SELECT 
      p.student_id,
      EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date_from AND a.session = 'FN1') AS fn1,
      EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date_from AND a.session = 'FN2') AS fn2,
      EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date_from AND a.session = 'AN1') AS an1,
      EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = p.student_id AND a.date = p_date_from AND a.session = 'AN2') AS an2
    FROM profiles p
    WHERE p.role = 'Student'
  )

  SELECT * FROM (
    SELECT 
      p.student_id,
      p.name,
      p.department,
      p.year,
      p.section,
      COALESCE(p.batch, '') AS batch,
      COALESCE(p.qr_blocked, FALSE) AS qr_blocked,
      COALESCE(dp.fn1, FALSE) AS fn1_present,
      COALESCE(dp.fn2, FALSE) AS fn2_present,
      COALESCE(dp.an1, FALSE) AS an1_present,
      COALESCE(dp.an2, FALSE) AS an2_present,
      COALESCE(rsp.present_count, 0) AS range_present,
      COALESCE(
        CASE 
          WHEN p.batch IS NOT NULL AND p.batch != '' THEN rbc.sessions_count
          ELSE rsc.sessions_count
        END,
        0
      ) AS range_conducted,
      GREATEST(0,
        COALESCE(
          CASE 
            WHEN p.batch IS NOT NULL AND p.batch != '' THEN rbc.sessions_count
            ELSE rsc.sessions_count
          END,
          0
        ) - COALESCE(rsp.present_count, 0)
      ) AS range_absent,
      CASE 
        WHEN COALESCE(
          CASE 
            WHEN p.batch IS NOT NULL AND p.batch != '' THEN rbc.sessions_count
            ELSE rsc.sessions_count
          END,
          0
        ) > 0 THEN 
          ROUND((COALESCE(rsp.present_count, 0)::NUMERIC / COALESCE(
            CASE 
              WHEN p.batch IS NOT NULL AND p.batch != '' THEN rbc.sessions_count
              ELSE rsc.sessions_count
            END,
            0
          )) * 100, 1)
        ELSE 
          0::NUMERIC
      END AS range_pct,
      COALESCE(osp.present_count, 0) AS overall_present,
      COALESCE(
        CASE 
          WHEN p.batch IS NOT NULL AND p.batch != '' THEN obc.sessions_count
          ELSE osc.sessions_count
        END,
        0
      ) AS overall_conducted,
      GREATEST(0,
        COALESCE(
          CASE 
            WHEN p.batch IS NOT NULL AND p.batch != '' THEN obc.sessions_count
            ELSE osc.sessions_count
          END,
          0
        ) - COALESCE(osp.present_count, 0)
      ) AS overall_absent,
      CASE 
        WHEN COALESCE(
          CASE 
            WHEN p.batch IS NOT NULL AND p.batch != '' THEN obc.sessions_count
            ELSE osc.sessions_count
          END,
          0
        ) > 0 THEN 
          ROUND((COALESCE(osp.present_count, 0)::NUMERIC / COALESCE(
            CASE 
              WHEN p.batch IS NOT NULL AND p.batch != '' THEN obc.sessions_count
              ELSE osc.sessions_count
            END,
            0
          )) * 100, 1)
        ELSE 
          0::NUMERIC
      END AS overall_pct
    FROM profiles p
    LEFT JOIN daily_presence dp ON dp.student_id = p.student_id
    LEFT JOIN range_batch_conducted rbc ON rbc.department = p.department AND rbc.year = p.year AND rbc.batch = p.batch
    LEFT JOIN range_section_conducted rsc ON rsc.department = p.department AND rsc.year = p.year AND rsc.section = p.section
    LEFT JOIN range_student_presents rsp ON rsp.student_id = p.student_id
    LEFT JOIN overall_batch_conducted obc ON obc.department = p.department AND obc.year = p.year AND obc.batch = p.batch
    LEFT JOIN overall_section_conducted osc ON osc.department = p.department AND osc.year = p.year AND osc.section = p.section
    LEFT JOIN overall_student_presents osp ON osp.student_id = p.student_id
    WHERE p.role = 'Student'
      AND p.status = 'Active'
      AND (p_department IS NULL OR p_department = '' OR p.department = p_department)
      AND (p_section IS NULL OR p_section = '' OR p.section = p_section)
      AND (p_year IS NULL OR p.year = p_year)
      AND (p_batch IS NULL OR p_batch = '' OR p.batch = p_batch)
      AND (p_search IS NULL OR p_search = '' OR p.student_id ILIKE '%' || p_search || '%' OR p.name ILIKE '%' || p_search || '%')
  ) sub
  WHERE 
    (p_attendance_filter IS NULL OR p_attendance_filter = '' OR p_attendance_filter = 'all')
    OR (p_attendance_filter = 'defaulter' AND (
      (p_date_from = p_date_to AND sub.overall_pct < 75) OR
      (p_date_from != p_date_to AND sub.range_pct < 75)
    ))
    OR (p_attendance_filter = 'critical' AND (
      (p_date_from = p_date_to AND sub.overall_pct < 50) OR
      (p_date_from != p_date_to AND sub.range_pct < 50)
    ))
    OR (p_attendance_filter = 'good' AND (
      (p_date_from = p_date_to AND sub.overall_pct >= 75) OR
      (p_date_from != p_date_to AND sub.range_pct >= 75)
    ))
  ORDER BY sub.department, sub.year, sub.section, sub.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_date date DEFAULT CURRENT_DATE)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_students INTEGER;
  v_total_faculty  INTEGER;
  v_today_unique   INTEGER;
  v_today_scans    INTEGER;
  v_by_session     JSON;
  v_by_dept        JSON;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_attendance_report(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_department text DEFAULT NULL::text, p_section text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_session text DEFAULT NULL::text, p_batch text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, student_id text, student_name text, department text, section text, year integer, session text, date date, marked_by_name text, "timestamp" timestamp with time zone, batch text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
  RETURN QUERY
  SELECT
    a.id,
    a.student_id,
    a.student_name,
    a.department,
    a.section,
    a.year,
    a.session,
    a.date,
    a.marked_by_name,
    a."timestamp",
    a.batch
  FROM attendance a
  WHERE
    (p_date_from  IS NULL OR a.date       >= p_date_from)
    AND (p_date_to    IS NULL OR a.date       <= p_date_to)
    AND (p_department IS NULL OR a.department  = p_department)
    AND (p_section    IS NULL OR a.section     = p_section)
    AND (p_year       IS NULL OR a.year        = p_year)
    AND (p_session    IS NULL OR a.session     = p_session)
    AND (p_batch      IS NULL OR a.batch       = p_batch)
  ORDER BY a.date DESC, a.department, a.section, a.session, a.student_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_batch_attendance_roster_multi(p_date date, p_batch text DEFAULT NULL::text)
 RETURNS TABLE(student_id text, name text, batch text, year integer, fn1_present boolean, fn2_present boolean, an1_present boolean, an2_present boolean, qr_blocked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_attendance_roster(p_date date, p_session text DEFAULT NULL::text, p_department text DEFAULT NULL::text, p_section text DEFAULT NULL::text)
 RETURNS TABLE(student_id text, name text, department text, year integer, section text, present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_batch_summary_range(p_date_from date, p_date_to date)
 RETURNS TABLE(batch text, fn1_count numeric, fn2_count numeric, an1_count numeric, an2_count numeric, total_students bigint, present_count numeric, attendance_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_days INTEGER;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_attendance_roster_multi(p_date date, p_department text DEFAULT NULL::text, p_section text DEFAULT NULL::text)
 RETURNS TABLE(student_id text, name text, department text, year integer, section text, fn1_present boolean, fn2_present boolean, an1_present boolean, an2_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_batch_summary(p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(batch text, total_students bigint, present_count bigint, attendance_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF;  RETURN QUERY SELECT p.batch, COUNT(DISTINCT p.id), COUNT(DISTINCT a.student_id), CASE WHEN COUNT(DISTINCT p.id) > 0 THEN ROUND((COUNT(DISTINCT a.student_id)::NUMERIC / COUNT(DISTINCT p.id)) * 100, 1) ELSE 0::NUMERIC END FROM profiles p LEFT JOIN attendance a ON a.student_id = p.student_id AND a.date = p_date WHERE p.role = 'Student' AND p.status = 'Active' AND p.batch IS NOT NULL AND p.batch != '' GROUP BY p.batch ORDER BY p.batch; END; $function$;

CREATE OR REPLACE FUNCTION public.get_student_attendance_stats(p_student_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_dept TEXT;
  v_sec  TEXT;
  v_year INTEGER;
  v_batch TEXT;
  v_present_count INTEGER;
  v_total_conducted INTEGER;
  v_absent_count INTEGER;
  v_attendance_pct NUMERIC;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') AND p_student_id IS DISTINCT FROM (SELECT student_id FROM profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF; 
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

  SELECT COUNT(DISTINCT (date, session)) INTO v_present_count
  FROM attendance
  WHERE student_id = p_student_id;

  SELECT COUNT(DISTINCT (date, session)) INTO v_total_conducted
  FROM attendance
  WHERE department = v_dept 
    AND year = v_year 
    AND (
      section = v_sec 
      OR (batch IS NOT NULL AND batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
    );

  v_total_conducted := GREATEST(COALESCE(v_total_conducted, 0), v_present_count);
  v_absent_count := GREATEST(0, v_total_conducted - v_present_count);

  IF v_total_conducted > 0 THEN
    v_attendance_pct := LEAST(100.0, ROUND((v_present_count::NUMERIC / v_total_conducted) * 100, 1));
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
$function$;

CREATE OR REPLACE FUNCTION public.check_and_update_student_qr_blocked(p_student_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_dept TEXT;
  v_sec TEXT;
  v_year INTEGER;
  v_batch TEXT;
  v_unblocked_at TIMESTAMPTZ;
  v_qr_blocked BOOLEAN;
  v_block_immediate BOOLEAN;
  v_qr_blocking_enabled BOOLEAN;
  v_qr_blocking_enabled_at TIMESTAMPTZ;
  v_effective_start TIMESTAMPTZ;
  v_has_missed BOOLEAN := FALSE;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') AND p_student_id IS DISTINCT FROM (SELECT student_id FROM profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF; 
  SELECT COALESCE(qr_blocking_enabled, FALSE),
         COALESCE(block_immediate, FALSE),
         qr_blocking_enabled_at
  INTO   v_qr_blocking_enabled, v_block_immediate, v_qr_blocking_enabled_at
  FROM   session_settings
  WHERE  id = 1;

  SELECT department, section, year, batch, qr_unblocked_at, qr_blocked
  INTO   v_dept, v_sec, v_year, v_batch, v_unblocked_at, v_qr_blocked
  FROM   profiles
  WHERE  student_id = p_student_id AND role = 'Student'
  LIMIT  1;

  IF v_dept IS NULL THEN RETURN FALSE; END IF;

  IF NOT v_qr_blocking_enabled THEN
    IF v_qr_blocked THEN
      UPDATE profiles
      SET qr_blocked = FALSE, qr_unblocked_at = NOW()
      WHERE student_id = p_student_id AND role = 'Student';
    END IF;
    RETURN FALSE;
  END IF;

  -- Effective baseline: latest of per-student unblock time and feature activation time.
  -- Prevents retroactive blocking for sessions missed before the feature was enabled.
  v_effective_start := GREATEST(
    COALESCE(v_unblocked_at,           '-infinity'::TIMESTAMPTZ),
    COALESCE(v_qr_blocking_enabled_at, NOW())
  );

  IF v_block_immediate THEN
    -- Block as soon as a session window closes and the student was absent,
    -- counting only sessions that ended after the feature was activated.
    SELECT EXISTS (
      WITH conducted_sessions AS (
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
      SELECT 1
      FROM conducted_sessions cs
      WHERE get_session_end_timestamp(cs.date, cs.session) < NOW()
        AND get_session_end_timestamp(cs.date, cs.session) > v_effective_start
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
          WHERE a.student_id = p_student_id AND a.date = cs.date AND a.session = cs.session
        )
    ) INTO v_has_missed;
  ELSE
    -- Next-day mode: only look at yesterday (CURRENT_DATE - 1),
    -- on or after the effective activation date.
    SELECT EXISTS (
      WITH conducted_sessions AS (
        SELECT DISTINCT a.date, a.session
        FROM attendance a
        WHERE a.department = v_dept
          AND a.year = v_year
          AND (
            (v_batch IS NOT NULL AND v_batch != '' AND a.batch = v_batch)
            OR
            ((v_batch IS NULL OR v_batch = '') AND a.section = v_sec AND (a.batch IS NULL OR a.batch = ''))
          )
          AND a.date = CURRENT_DATE - 1
          AND a.date >= v_effective_start::date
      )
      SELECT 1
      FROM conducted_sessions cs
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.student_id = p_student_id AND a.date = cs.date AND a.session = cs.session
      )
    ) INTO v_has_missed;
  END IF;

  IF v_has_missed AND NOT v_qr_blocked THEN
    UPDATE profiles SET qr_blocked = TRUE
    WHERE student_id = p_student_id AND role = 'Student';
    v_qr_blocked := TRUE;
  END IF;

  RETURN v_qr_blocked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_attendance_history(p_student_id text)
 RETURNS TABLE(date date, session text, present boolean, marked_by_name text, "timestamp" timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_dept TEXT;
  v_sec  TEXT;
  v_year INTEGER;
  v_batch TEXT;
BEGIN IF _my_role() NOT IN ('Faculty', 'Admin') AND p_student_id IS DISTINCT FROM (SELECT student_id FROM profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF; 
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
$function$;

CREATE OR REPLACE FUNCTION public.get_current_session()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_now              TIME;
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
$function$;


-- Remove anon (and any other PUBLIC) execute rights; only logged-in users
-- may call these at all, with the internal guards above narrowing further.
REVOKE ALL ON FUNCTION check_and_update_student_qr_blocked(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_attendance_report(DATE, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_attendance_roster(DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_attendance_roster_multi(DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_batch_attendance_roster(DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_batch_attendance_roster_multi(DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_batch_summary(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_batch_summary_range(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_current_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_dashboard_stats(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_distinct_filters() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_section_summary(DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_student_attendance_history(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_student_attendance_stats(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_unified_student_roster(DATE, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION check_and_update_student_qr_blocked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_report(DATE, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_roster(DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_attendance_roster_multi(DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_attendance_roster(DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_attendance_roster_multi(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_summary(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_summary_range(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_session() TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_distinct_filters() TO authenticated;
GRANT EXECUTE ON FUNCTION get_section_summary(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_attendance_history(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_attendance_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unified_student_roster(DATE, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Dead, unauthenticated-callable legacy RPC with zero validation of any kind
-- (predecessor of get_unified_student_roster) — not referenced anywhere in
-- the current frontend. Dropped rather than merely locked down.
DROP FUNCTION IF EXISTS get_cumulative_attendance_report(DATE, DATE, TEXT, TEXT, INTEGER, TEXT, TEXT);

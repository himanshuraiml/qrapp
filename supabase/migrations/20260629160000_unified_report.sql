-- Migration: Create get_unified_student_roster function for overall and daily attendance tracking
-- Created: 2026-06-29

CREATE OR REPLACE FUNCTION get_unified_student_roster(
  p_date_from        DATE,
  p_date_to          DATE,
  p_department       TEXT DEFAULT NULL,
  p_section          TEXT DEFAULT NULL,
  p_year             INTEGER DEFAULT NULL,
  p_batch            TEXT DEFAULT NULL,
  p_search           TEXT DEFAULT NULL,
  p_attendance_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  student_id        TEXT,
  name              TEXT,
  department        TEXT,
  year              INTEGER,
  section           TEXT,
  batch             TEXT,
  qr_blocked        BOOLEAN,
  fn1_present       BOOLEAN,
  fn2_present       BOOLEAN,
  an1_present       BOOLEAN,
  an2_present       BOOLEAN,
  range_present     BIGINT,
  range_conducted   BIGINT,
  range_absent      BIGINT,
  range_pct         numeric,
  overall_present   BIGINT,
  overall_conducted BIGINT,
  overall_absent    BIGINT,
  overall_pct       numeric
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- 1. Range conducted sessions per group (dept, year, batch OR dept, year, section where batch is empty) in date range
  range_batch_conducted AS (
    SELECT 
      a.department,
      a.year,
      a.batch,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE a.batch IS NOT NULL AND a.batch != ''
      AND a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY a.department, a.year, a.batch
  ),
  range_section_conducted AS (
    SELECT 
      a.department,
      a.year,
      a.section,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE (a.batch IS NULL OR a.batch = '')
      AND a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY a.department, a.year, a.section
  ),
  range_student_presents AS (
    SELECT 
      a.student_id,
      COUNT(*)::BIGINT AS present_count
    FROM attendance a
    WHERE a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY a.student_id
  ),

  -- 2. Overall conducted sessions (all-time) per group
  overall_batch_conducted AS (
    SELECT 
      a.department,
      a.year,
      a.batch,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE a.batch IS NOT NULL AND a.batch != ''
    GROUP BY a.department, a.year, a.batch
  ),
  overall_section_conducted AS (
    SELECT 
      a.department,
      a.year,
      a.section,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE (a.batch IS NULL OR a.batch = '')
    GROUP BY a.department, a.year, a.section
  ),
  overall_student_presents AS (
    SELECT 
      a.student_id,
      COUNT(*)::BIGINT AS present_count
    FROM attendance a
    GROUP BY a.student_id
  ),

  -- 3. Daily session presence (only populated/checked if p_date_from == p_date_to)
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
      
      -- Range stats
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

      -- Overall stats
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
$$;

-- Migration: Create get_cumulative_attendance_report function for overall student attendance tracking
-- Created: 2026-06-29

CREATE OR REPLACE FUNCTION get_cumulative_attendance_report(
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_section    TEXT DEFAULT NULL,
  p_year       INTEGER DEFAULT NULL,
  p_batch      TEXT DEFAULT NULL,
  p_search     TEXT DEFAULT NULL
)
RETURNS TABLE (
  student_id     TEXT,
  name           TEXT,
  department     TEXT,
  year           INTEGER,
  section        TEXT,
  batch          TEXT,
  present_count  BIGINT,
  total_conducted BIGINT,
  absent_count   BIGINT,
  attendance_pct NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH batch_conducted AS (
    -- Total conducted sessions per (department, year, batch) in the date range
    SELECT 
      a.department,
      a.year,
      a.batch,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE a.batch IS NOT NULL AND a.batch != ''
      AND (p_date_from IS NULL OR a.date >= p_date_from)
      AND (p_date_to IS NULL OR a.date <= p_date_to)
    GROUP BY a.department, a.year, a.batch
  ),
  section_conducted AS (
    -- Total conducted sessions per (department, year, section) where batch is empty in the date range
    SELECT 
      a.department,
      a.year,
      a.section,
      COUNT(DISTINCT (a.date, a.session))::BIGINT AS sessions_count
    FROM attendance a
    WHERE (a.batch IS NULL OR a.batch = '')
      AND (p_date_from IS NULL OR a.date >= p_date_from)
      AND (p_date_to IS NULL OR a.date <= p_date_to)
    GROUP BY a.department, a.year, a.section
  ),
  student_presents AS (
    -- Count of present sessions per student in the date range
    SELECT 
      a.student_id,
      COUNT(*)::BIGINT AS present_count
    FROM attendance a
    WHERE (p_date_from IS NULL OR a.date >= p_date_from)
      AND (p_date_to IS NULL OR a.date <= p_date_to)
    GROUP BY a.student_id
  )
  SELECT 
    p.student_id,
    p.name,
    p.department,
    p.year,
    p.section,
    COALESCE(p.batch, '') AS batch,
    COALESCE(sp.present_count, 0) AS present_count,
    COALESCE(
      CASE 
        WHEN p.batch IS NOT NULL AND p.batch != '' THEN bc.sessions_count
        ELSE sc.sessions_count
      END,
      0
    ) AS total_conducted,
    GREATEST(0, 
      COALESCE(
        CASE 
          WHEN p.batch IS NOT NULL AND p.batch != '' THEN bc.sessions_count
          ELSE sc.sessions_count
        END,
        0
      ) - COALESCE(sp.present_count, 0)
    ) AS absent_count,
    CASE 
      WHEN COALESCE(
        CASE 
          WHEN p.batch IS NOT NULL AND p.batch != '' THEN bc.sessions_count
          ELSE sc.sessions_count
        END,
        0
      ) > 0 THEN 
        ROUND((COALESCE(sp.present_count, 0)::NUMERIC / COALESCE(
          CASE 
            WHEN p.batch IS NOT NULL AND p.batch != '' THEN bc.sessions_count
            ELSE sc.sessions_count
          END,
          0
        )) * 100, 1)
      ELSE 
        0::NUMERIC
    END AS attendance_pct
  FROM profiles p
  LEFT JOIN batch_conducted bc ON bc.department = p.department AND bc.year = p.year AND bc.batch = p.batch
  LEFT JOIN section_conducted sc ON sc.department = p.department AND sc.year = p.year AND sc.section = p.section
  LEFT JOIN student_presents sp ON sp.student_id = p.student_id
  WHERE p.role = 'Student'
    AND p.status = 'Active'
    AND (p_department IS NULL OR p_department = '' OR p.department = p_department)
    AND (p_section IS NULL OR p_section = '' OR p.section = p_section)
    AND (p_year IS NULL OR p.year = p_year)
    AND (p_batch IS NULL OR p_batch = '' OR p.batch = p_batch)
    AND (p_search IS NULL OR p_search = '' OR p.student_id ILIKE '%' || p_search || '%' OR p.name ILIKE '%' || p_search || '%')
  ORDER BY p.department, p.year, p.section, p.name;
END;
$$;

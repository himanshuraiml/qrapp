-- Migration: Update get_attendance_report RPC to support batch filtering and return student batch
-- Created: 2026-06-08

-- Drop the old version of the function first (with 6 parameters)
DROP FUNCTION IF EXISTS get_attendance_report(DATE, DATE, TEXT, TEXT, INTEGER, TEXT);

-- Recreate the function with p_batch parameter and batch returned in output
CREATE OR REPLACE FUNCTION get_attendance_report(
  p_date_from  DATE    DEFAULT NULL,
  p_date_to    DATE    DEFAULT NULL,
  p_department TEXT    DEFAULT NULL,
  p_section    TEXT    DEFAULT NULL,
  p_year       INTEGER DEFAULT NULL,
  p_session    TEXT    DEFAULT NULL,
  p_batch      TEXT    DEFAULT NULL
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
  "timestamp"    TIMESTAMPTZ,
  batch          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
$$;

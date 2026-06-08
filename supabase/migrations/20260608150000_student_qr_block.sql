-- Migration: Add columns and functions for student QR code blocking on missed sessions
-- Created: 2026-06-08

-- 1. Add qr_blocked and qr_unblocked_at to profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS qr_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qr_unblocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Add block_immediate to session_settings
ALTER TABLE session_settings
  ADD COLUMN IF NOT EXISTS block_immediate BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Helper function to calculate session end timestamp in IST
CREATE OR REPLACE FUNCTION get_session_end_timestamp(p_date DATE, p_session TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_time_str TEXT;
BEGIN
  SELECT 
    CASE p_session
      WHEN 'FN1' THEN fn1_end::TEXT
      WHEN 'FN2' THEN fn2_end::TEXT
      WHEN 'AN1' THEN an1_end::TEXT
      WHEN 'AN2' THEN an2_end::TEXT
      ELSE '17:00:00'
    END
  INTO v_time_str
  FROM session_settings
  WHERE id = 1;

  IF v_time_str IS NULL THEN
    v_time_str := CASE p_session
      WHEN 'FN1' THEN '11:00:00'
      WHEN 'FN2' THEN '13:00:00'
      WHEN 'AN1' THEN '15:00:00'
      WHEN 'AN2' THEN '17:00:00'
      ELSE '17:00:00'
    END;
  END IF;

  RETURN (p_date::TEXT || ' ' || v_time_str)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata';
END;
$$;

-- 4. Main check and update function
CREATE OR REPLACE FUNCTION check_and_update_student_qr_blocked(p_student_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dept TEXT;
  v_sec TEXT;
  v_year INTEGER;
  v_batch TEXT;
  v_unblocked_at TIMESTAMPTZ;
  v_qr_blocked BOOLEAN;
  v_block_immediate BOOLEAN;
  v_has_missed BOOLEAN := FALSE;
BEGIN
  -- Get student profile details
  SELECT department, section, year, batch, qr_unblocked_at, qr_blocked
  INTO v_dept, v_sec, v_year, v_batch, v_unblocked_at, v_qr_blocked
  FROM profiles
  WHERE student_id = p_student_id AND role = 'Student'
  LIMIT 1;

  -- If student doesn't exist or isn't a student, return false
  IF v_dept IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get block timing configuration
  SELECT COALESCE(block_immediate, FALSE)
  INTO v_block_immediate
  FROM session_settings
  WHERE id = 1;

  -- Check for missed sessions
  IF v_block_immediate THEN
    -- Immediate blocking: check if there's any completed session in the past (using timestamp comparison)
    -- after v_unblocked_at where the student was absent
    SELECT EXISTS (
      WITH conducted_sessions AS (
        SELECT DISTINCT a.date, a.session
        FROM attendance a
        WHERE a.department = v_dept
          AND a.year = v_year
          AND (
            a.section = v_sec
            OR (a.batch IS NOT NULL AND a.batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
          )
      )
      SELECT 1
      FROM conducted_sessions cs
      WHERE get_session_end_timestamp(cs.date, cs.session) < NOW()
        AND get_session_end_timestamp(cs.date, cs.session) > v_unblocked_at
        AND NOT EXISTS (
          SELECT 1
          FROM attendance a
          WHERE a.student_id = p_student_id
            AND a.date = cs.date
            AND a.session = cs.session
        )
    ) INTO v_has_missed;
  ELSE
    -- Next day blocking: check if there's any completed session on a previous date (date < CURRENT_DATE)
    -- on or after the date the student was unblocked, where the student was absent
    SELECT EXISTS (
      WITH conducted_sessions AS (
        SELECT DISTINCT a.date, a.session
        FROM attendance a
        WHERE a.department = v_dept
          AND a.year = v_year
          AND (
            a.section = v_sec
            OR (a.batch IS NOT NULL AND a.batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
          )
          AND a.date < CURRENT_DATE
          AND a.date >= v_unblocked_at::date
      )
      SELECT 1
      FROM conducted_sessions cs
      WHERE NOT EXISTS (
        SELECT 1
        FROM attendance a
        WHERE a.student_id = p_student_id
          AND a.date = cs.date
          AND a.session = cs.session
      )
    ) INTO v_has_missed;
  END IF;

  -- Update profile status if there's a new miss and they are not currently marked blocked
  IF v_has_missed AND NOT v_qr_blocked THEN
    UPDATE profiles
    SET qr_blocked = TRUE
    WHERE student_id = p_student_id AND role = 'Student';
    v_qr_blocked := TRUE;
  END IF;

  RETURN v_qr_blocked;
END;
$$;

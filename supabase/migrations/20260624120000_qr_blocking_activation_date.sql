-- Migration: Track QR blocking activation date to prevent retroactive blocking
-- Created: 2026-06-24

-- 1. Add activation timestamp — set when qr_blocking_enabled is toggled ON
ALTER TABLE session_settings
  ADD COLUMN IF NOT EXISTS qr_blocking_enabled_at TIMESTAMPTZ;

-- 2. Update check_and_update_student_qr_blocked to use GREATEST(student unblock time,
--    feature activation time) as the baseline, so sessions missed before the feature
--    was enabled are never counted.
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
  v_qr_blocking_enabled BOOLEAN;
  v_qr_blocking_enabled_at TIMESTAMPTZ;
  v_effective_start TIMESTAMPTZ;
  v_has_missed BOOLEAN := FALSE;
BEGIN
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
            a.section = v_sec
            OR (a.batch IS NOT NULL AND a.batch = v_batch AND v_batch IS NOT NULL AND v_batch != '')
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
    -- Next-day mode: only look at fully past dates (date < today),
    -- on or after the effective activation date.
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
$$;

-- Migration: Faculty Batch Restriction and Batch Venues
-- Created: 2026-06-17

-- 1. Add restrict_faculty_batch to session_settings
ALTER TABLE session_settings
  ADD COLUMN IF NOT EXISTS restrict_faculty_batch BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add special_login to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS special_login BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create batch_venues table
CREATE TABLE IF NOT EXISTS batch_venues (
  batch TEXT PRIMARY KEY,
  venue TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and add policies for batch_venues
ALTER TABLE batch_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batch_venues: authenticated read"
  ON batch_venues FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "batch_venues: admin all"
  ON batch_venues FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'Admin');

-- Add updated_at trigger for batch_venues
CREATE TRIGGER batch_venues_updated_at
  BEFORE UPDATE ON batch_venues
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- 4. Redefine mark_attendance_safe to enforce faculty batch restrictions
CREATE OR REPLACE FUNCTION mark_attendance_safe(
  p_student_id     TEXT,
  p_student_name   TEXT,
  p_department     TEXT,
  p_section        TEXT,
  p_year           INTEGER,
  p_batch          TEXT,
  p_session        TEXT,
  p_marked_by      UUID,
  p_marked_by_name TEXT,
  p_date           DATE        DEFAULT CURRENT_DATE,
  p_timestamp      TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_time                   TIME;
  v_fn1_start              TIME := '08:00'::TIME;
  v_fn1_end                TIME := '11:00'::TIME;
  v_fn2_start              TIME := '11:00'::TIME;
  v_fn2_end                TIME := '13:00'::TIME;
  v_an1_start              TIME := '13:00'::TIME;
  v_an1_end                TIME := '15:00'::TIME;
  v_an2_start              TIME := '15:00'::TIME;
  v_an2_end                TIME := '17:00'::TIME;
  v_target_session         TEXT;
  v_last_timestamp         TIMESTAMPTZ;
  v_last_id                UUID;
  v_gap_minutes            NUMERIC;
  v_new                    UUID;
  v_cfg_enabled            BOOLEAN := TRUE;
  v_restrict_faculty_batch BOOLEAN := FALSE;
  v_faculty_batch          TEXT;
  v_special_login          BOOLEAN := FALSE;
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
         COALESCE(enabled, TRUE),
         COALESCE(restrict_faculty_batch, FALSE)
  INTO   v_fn1_start, v_fn1_end, v_fn2_start, v_fn2_end, v_an1_start, v_an1_end, v_an2_start, v_an2_end, v_cfg_enabled, v_restrict_faculty_batch
  FROM   session_settings
  WHERE  id = 1;

  -- 2b. Enforce Faculty Batch Restriction if enabled
  IF v_restrict_faculty_batch THEN
    SELECT batch, COALESCE(special_login, FALSE)
    INTO   v_faculty_batch, v_special_login
    FROM   profiles
    WHERE  id = p_marked_by AND role = 'Faculty';

    IF NOT v_special_login THEN
      IF v_faculty_batch IS NULL OR v_faculty_batch = '' THEN
        RETURN json_build_object(
          'success', FALSE,
          'message', 'Restricted: Assign a batch in your dashboard first.'
        );
      END IF;

      IF p_batch IS NULL OR p_batch = '' OR p_batch != v_faculty_batch THEN
        RETURN json_build_object(
          'success', FALSE,
          'message', 'Restricted: You can only mark Batch ' || v_faculty_batch || ' (Student is Batch ' || COALESCE(p_batch, 'None') || ')'
        );
      END IF;
    END IF;
  END IF;

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

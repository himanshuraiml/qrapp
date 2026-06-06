-- Transition QR QRapp attendance sessions from count-based to time-based matching.
-- Conforms to the class schedule: FN1 (before 11:00 AM), FN2 (11:00 AM - 1:00 PM), AN1 (1:00 PM - 3:00 PM), AN2 (after 3:00 PM).

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
  v_time             TIME;
  v_m_start          TIME := '09:00'::TIME;
  v_m_end            TIME := '12:30'::TIME;
  v_a_start          TIME := '13:30'::TIME;
  v_a_end            TIME := '17:00'::TIME;
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
  SELECT COALESCE(morning_start, '09:00'::TIME),
         COALESCE(morning_end, '12:30'::TIME),
         COALESCE(afternoon_start, '13:30'::TIME),
         COALESCE(afternoon_end, '17:00'::TIME),
         COALESCE(enabled, TRUE)
  INTO   v_m_start, v_m_end, v_a_start, v_a_end, v_cfg_enabled
  FROM   session_settings
  WHERE  id = 1;

  -- 3. Determine target session based on time boundaries:
  --    FN1: Before 11:00 AM
  --    FN2: 11:00 AM to 1:00 PM
  --    AN1: 1:00 PM to 3:00 PM
  --    AN2: At or after 3:00 PM
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


CREATE OR REPLACE FUNCTION get_current_session()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_now        TIME;
  v_cfg        RECORD;
  v_m_start    TIME := '09:00'::TIME;
  v_m_end      TIME := '12:30'::TIME;
  v_a_start    TIME := '13:30'::TIME;
  v_a_end      TIME := '17:00'::TIME;
  v_enabled    BOOLEAN := TRUE;
BEGIN
  v_now := (NOW() AT TIME ZONE 'Asia/Kolkata')::TIME;
  
  SELECT COALESCE(morning_start, '09:00'::TIME),
         COALESCE(morning_end, '12:30'::TIME),
         COALESCE(afternoon_start, '13:30'::TIME),
         COALESCE(afternoon_end, '17:00'::TIME),
         COALESCE(enabled, TRUE)
  INTO   v_m_start, v_m_end, v_a_start, v_a_end, v_enabled
  FROM   session_settings
  WHERE  id = 1;

  IF NOT v_enabled THEN
    RETURN NULL;
  END IF;

  -- Verify current time falls within active morning/afternoon session bounds
  IF v_now BETWEEN v_m_start AND v_m_end THEN
    IF v_now < '11:00:00'::TIME THEN
      RETURN 'FN1';
    ELSE
      RETURN 'FN2';
    END IF;
  ELSIF v_now BETWEEN v_a_start AND v_a_end THEN
    IF v_now < '15:00:00'::TIME THEN
      RETURN 'AN1';
    ELSE
      RETURN 'AN2';
    END IF;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSOLIDATED MIGRATIONS 08 - 11 (VAPT SECURITY AUDIT REMEDIATION)
-- Institution: SRMIST QR Attendance Portal (medhiva.in)
--
-- Safe & Non-Destructive: Preserves 100% of existing student, faculty, and attendance data.
-- Run this entire script in the Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 08: MARK ATTENDANCE RPC HARDENING, RLS TRIGGER & LOCKOUT TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop old overloads of mark_attendance_safe
DROP FUNCTION IF EXISTS public.mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, UUID, TEXT, DATE, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public.mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, DATE, TIMESTAMPTZ
);

-- 2. Create hardened mark_attendance_safe function
CREATE OR REPLACE FUNCTION public.mark_attendance_safe(
  p_student_id     TEXT,
  p_student_name   TEXT,
  p_department     TEXT,
  p_section        TEXT,
  p_year           INTEGER,
  p_batch          TEXT,
  p_session        TEXT,
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
  v_student_status         TEXT;
  v_marker_id              UUID;
  v_marker_role            TEXT;
  v_marker_status          TEXT;
  v_marker_name            TEXT;
BEGIN
  -- 0a. Marker identity is derived strictly from auth.uid() — never from client input.
  v_marker_id := auth.uid();
  IF v_marker_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Unauthorized: sign in as Faculty or Admin to mark attendance.'
    );
  END IF;

  SELECT role, status, name, COALESCE(batch, ''), COALESCE(special_login, FALSE)
  INTO   v_marker_role, v_marker_status, v_marker_name, v_faculty_batch, v_special_login
  FROM   public.profiles
  WHERE  id = v_marker_id;

  IF v_marker_role IS NULL OR v_marker_role NOT IN ('Faculty', 'Admin') THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Forbidden: only Faculty or Admin accounts can mark attendance.'
    );
  END IF;

  IF v_marker_status = 'Inactive' THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Restricted: Marker account is deactivated.'
    );
  END IF;

  -- 0b. Check if student profile is active
  SELECT status INTO v_student_status
  FROM   public.profiles
  WHERE  student_id = p_student_id AND role = 'Student';

  IF v_student_status IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Restricted: Student profile not found.'
    );
  ELSIF v_student_status = 'Inactive' THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Restricted: Student account is deactivated.'
    );
  END IF;

  -- 1. Extract scan time in IST
  v_time := (p_timestamp AT TIME ZONE 'Asia/Kolkata')::TIME;

  -- 2. Fetch session settings configuration
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
  FROM   public.session_settings
  WHERE  id = 1;

  -- 2b. Enforce Faculty Batch Restriction if enabled
  IF v_restrict_faculty_batch AND v_marker_role = 'Faculty' THEN
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

  -- 3. Determine target session
  IF v_time BETWEEN v_fn1_start AND v_fn1_end THEN
    v_target_session := 'FN1';
  ELSIF v_time BETWEEN v_fn2_start AND v_fn2_end THEN
    v_target_session := 'FN2';
  ELSIF v_time BETWEEN v_an1_start AND v_an1_end THEN
    v_target_session := 'AN1';
  ELSIF v_time BETWEEN v_an2_start AND v_an2_end THEN
    v_target_session := 'AN2';
  ELSE
    IF v_cfg_enabled THEN
      RETURN json_build_object(
        'success', FALSE,
        'message', 'Scan outside of active session windows.'
      );
    ELSE
      IF v_time < '13:00:00'::TIME THEN
        IF v_time < '11:00:00'::TIME THEN v_target_session := 'FN1'; ELSE v_target_session := 'FN2'; END IF;
      ELSE
        IF v_time < '15:00:00'::TIME THEN v_target_session := 'AN1'; ELSE v_target_session := 'AN2'; END IF;
      END IF;
    END IF;
  END IF;

  -- 4. Check for duplicate session scan today
  SELECT id, timestamp INTO v_last_id, v_last_timestamp
  FROM   public.attendance
  WHERE  student_id = p_student_id
    AND  date       = p_date
    AND  session    = v_target_session
  LIMIT 1;

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

  -- 5. Insert attendance record safely
  INSERT INTO public.attendance
    (student_id, student_name, department, section, year, batch,
     session, marked_by, marked_by_name, date, timestamp)
  VALUES
    (p_student_id, p_student_name, p_department, p_section, p_year, p_batch,
     v_target_session, v_marker_id, v_marker_name, p_date, p_timestamp)
  RETURNING id INTO v_new;

  RETURN json_build_object(
    'success', TRUE,
    'message', 'Marked successfully as ' || v_target_session,
    'id',      v_new,
    'session', v_target_session
  );
END;
$$;

-- Revoke anon RPC execution
REVOKE ALL ON FUNCTION public.mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, DATE, TIMESTAMPTZ
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, DATE, TIMESTAMPTZ
) TO authenticated;

-- Prevent role/status self-escalation on profiles table
CREATE OR REPLACE FUNCTION public._prevent_self_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF public._my_role() IS DISTINCT FROM 'Admin' AND auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Not authorized to change role'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Not authorized to change status'; END IF;
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN RAISE EXCEPTION 'Not authorized to change student_id'; END IF;
    IF NEW.special_login IS DISTINCT FROM OLD.special_login THEN RAISE EXCEPTION 'Not authorized to change special_login'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Not authorized to change id'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._prevent_self_role_escalation();

-- Login lockout tracking table
CREATE TABLE IF NOT EXISTS public.login_attempts (
  email         TEXT PRIMARY KEY,
  failed_count  INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 09: REPORTING RPC RBAC HARDENING & STATS BOUNDING
-- ─────────────────────────────────────────────────────────────────────────────

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
BEGIN 
  IF public._my_role() NOT IN ('Faculty', 'Admin') AND p_student_id IS DISTINCT FROM (SELECT student_id FROM public.profiles WHERE id = auth.uid()) THEN 
    RAISE EXCEPTION 'Forbidden'; 
  END IF; 

  SELECT department, section, year, batch 
  INTO v_dept, v_sec, v_year, v_batch
  FROM public.profiles
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
  FROM public.attendance
  WHERE student_id = p_student_id;

  SELECT COUNT(DISTINCT (date, session)) INTO v_total_conducted
  FROM public.attendance
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


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 10: ATTENDANCE & PLACEMENT DRIVE TABLE HARDENING
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop overly permissive REST insert policies
DROP POLICY IF EXISTS "attendance: faculty insert" ON public.attendance;

-- Revoke direct REST insertion from client keys
REVOKE INSERT ON TABLE public.attendance FROM authenticated, anon, PUBLIC;

-- Secure placement_drive_students modify policy
DROP POLICY IF EXISTS "placement_drive_students: admin and faculty modify" ON public.placement_drive_students;

DROP POLICY IF EXISTS "placement_drive_students: admin modify" ON public.placement_drive_students;
CREATE POLICY "placement_drive_students: admin modify"
  ON public.placement_drive_students FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'Admin'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION 11: IMMUTABLE AUDIT LOGS SCHEMA & HARDENING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type   TEXT        NOT NULL,
  user_id      UUID        REFERENCES auth.users(id),
  user_email   TEXT,
  ip_address   TEXT,
  details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs: admin read" ON public.audit_logs;
CREATE POLICY "audit_logs: admin read"
  ON public.audit_logs FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'Admin');

DROP POLICY IF EXISTS "audit_logs: staff insert" ON public.audit_logs;
CREATE POLICY "audit_logs: staff insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public._prevent_audit_log_tampering()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable_update ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public._prevent_audit_log_tampering();

DROP TRIGGER IF EXISTS audit_logs_immutable_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public._prevent_audit_log_tampering();

COMMIT;

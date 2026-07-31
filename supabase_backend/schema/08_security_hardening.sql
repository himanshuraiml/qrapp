-- ═══════════════════════════════════════════════════════════════
-- Security Hardening — response to VAPT Report (medhiva.in, 2026-07-31)
--
-- Fixes:
--   1. mark_attendance_safe accepted a client-controlled p_marked_by UUID
--      with no role check, letting any authenticated (or even anonymous)
--      caller mark attendance as if they were Faculty/Admin. The function
--      now derives the marker from auth.uid() and requires an Active
--      Faculty/Admin profile. p_marked_by / p_marked_by_name are removed.
--   2. anon key could invoke the RPC directly (no login required at all).
--      EXECUTE is now revoked from PUBLIC/anon and granted to authenticated
--      only; the internal role check still applies on top of that.
--   3. profiles RLS allowed a self-row UPDATE with no column restrictions,
--      so any logged-in user could PATCH their own role/status/student_id
--      straight to 'Admin'/'Faculty'. A BEFORE UPDATE trigger now blocks
--      changes to sensitive columns unless the actor is an Admin (or the
--      update comes from the service-role key, used only by already
--      admin-gated API routes).
--   4. No brute-force protection on login. Adds a login_attempts table used
--      by /api/auth/login-guard to lock out an email after repeated
--      failures. (Supabase Auth CAPTCHA + MFA should also be enabled in the
--      dashboard — that cannot be done from SQL.)
--
-- Also discovered live in production while writing this fix: a second,
-- much older overload of mark_attendance_safe(10 args, no p_batch) was
-- still deployed alongside the current one, with NO validation of
-- p_marked_by at all (not even an existence check) — a strictly worse
-- version of the same hole. It is unreferenced anywhere in this codebase
-- and is dropped outright below rather than patched.
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────
-- 1 & 2. mark_attendance_safe hardening
-- ─────────────────────────────────────────

-- Drop the old signature (client-supplied marker identity) — CREATE OR REPLACE
-- cannot change the parameter list, so the old function must be dropped first.
DROP FUNCTION IF EXISTS mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, UUID, TEXT, DATE, TIMESTAMPTZ
);

-- Dead legacy overload (no p_batch, no validation whatsoever) — see note above.
DROP FUNCTION IF EXISTS mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, DATE, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION mark_attendance_safe(
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
  -- 0a. Identify the marker strictly from the authenticated session — never
  -- from a client-supplied parameter. Anonymous (no JWT) callers are rejected.
  v_marker_id := auth.uid();
  IF v_marker_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Unauthorized: sign in as Faculty or Admin to mark attendance.'
    );
  END IF;

  SELECT role, status, name, COALESCE(batch, ''), COALESCE(special_login, FALSE)
  INTO   v_marker_role, v_marker_status, v_marker_name, v_faculty_batch, v_special_login
  FROM   profiles
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
  FROM   profiles
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

  -- 2b. Enforce Faculty Batch Restriction if enabled (Admins are exempt, same as before)
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

  -- 6. Insert the record — marked_by/marked_by_name always come from the
  -- verified session, never from client input.
  INSERT INTO attendance
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

-- Only logged-in users may call this RPC at all; the role check above then
-- narrows that down to Active Faculty/Admin. This closes the "public anon
-- key, no session required" access path used in the VAPT PoC.
--
-- Note: `anon` holds EXECUTE via this project's default privileges (ALTER
-- DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated),
-- a direct grant independent of PUBLIC — REVOKE ... FROM PUBLIC alone does
-- NOT remove it. `anon` must be revoked explicitly.
REVOKE ALL ON FUNCTION mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, DATE, TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_attendance_safe(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, DATE, TIMESTAMPTZ
) TO authenticated;

-- Close the root cause for future functions too: this project's default
-- privileges grant EXECUTE to anon on every new function created in public
-- by the postgres role. Stop that going forward (authenticated keeps it);
-- existing functions are handled explicitly above and in
-- 09_reporting_rpc_rbac.sql.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;


-- ─────────────────────────────────────────
-- 3. Prevent self-service privilege escalation on profiles
--
-- The existing "profiles: update" RLS policy allows a user to update their
-- own row but places no restriction on WHICH columns change — so any
-- logged-in student could PATCH /rest/v1/profiles?id=eq.<self> with
-- {"role":"Admin"} and grant themselves Admin. This trigger makes role,
-- status, student_id, special_login and id immutable for anyone who isn't
-- an Admin, regardless of which RLS policy let the UPDATE through.
--
-- Note: this deliberately does NOT block service-role writes (auth.uid() is
-- NULL for the service key), since those only ever run from the already
-- Admin-gated API routes (see src/app/api/admin/*). It also does not block
-- an Admin's own session doing legitimate role/status changes on other
-- users, nor a Faculty member self-assigning their scan `batch` (untouched
-- column).
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION _prevent_self_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF _my_role() IS DISTINCT FROM 'Admin' AND auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not authorized to change role';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Not authorized to change status';
    END IF;
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Not authorized to change student_id';
    END IF;
    IF NEW.special_login IS DISTINCT FROM OLD.special_login THEN
      RAISE EXCEPTION 'Not authorized to change special_login';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Not authorized to change id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_escalation ON profiles;
CREATE TRIGGER profiles_prevent_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION _prevent_self_role_escalation();


-- ─────────────────────────────────────────
-- 4. Login lockout bookkeeping (used by /api/auth/login-guard)
-- Only ever touched via the service-role key from that API route, so RLS is
-- enabled with zero policies — fully inaccessible via the public REST API.
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  email         TEXT PRIMARY KEY,
  failed_count  INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service-role key (which bypasses RLS)
-- may read/write this table.

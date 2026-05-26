-- Seed / Setup Guide for QR Attendance System
-- Run AFTER 01_tables.sql, 02_rls_policies.sql, 03_functions.sql

-- ─────────────────────────────────────────
-- STEP 1: Create the first Admin account
-- ─────────────────────────────────────────
-- Option A — via Supabase Dashboard:
--   Authentication → Users → "Add user"
--   Email: admin@srmist.ac.in   Password: <strong password>
--
-- Option B — via the web app's /api/admin/create-user endpoint
--   (requires SUPABASE_SERVICE_ROLE_KEY in server env)

-- After creating the auth user, run this (replace the UUID):
/*
INSERT INTO profiles (id, name, role, status)
VALUES (
  '<ADMIN-AUTH-UUID>',
  'System Administrator',
  'Admin',
  'Active'
);
*/


-- ─────────────────────────────────────────
-- STEP 2: Verify session_settings defaults
-- ─────────────────────────────────────────
-- Already inserted by 01_tables.sql. Update if needed:
/*
UPDATE session_settings SET
  morning_start   = '08:00',
  morning_end     = '12:00',
  afternoon_start = '13:00',
  afternoon_end   = '17:00',
  enabled         = TRUE
WHERE id = 1;
*/


-- ─────────────────────────────────────────
-- STEP 3: Create Faculty accounts (via Admin panel or SQL)
-- ─────────────────────────────────────────
-- 1. Create auth user (email: faculty@srmist.ac.in)
-- 2. Then insert profile:
/*
INSERT INTO profiles (id, name, role, department, status)
VALUES (
  '<FACULTY-AUTH-UUID>',
  'Dr. Faculty Name',
  'Faculty',
  'CSE',
  'Active'
);
*/


-- ─────────────────────────────────────────
-- STEP 4: Create Student accounts
-- ─────────────────────────────────────────
-- Students authenticate with email = '{student_id}@student.local'
-- The web app handles this mapping — students only type their roll number.
--
-- 1. Create auth user  email: ra2311003010001@student.local
-- 2. Then insert profile:
/*
INSERT INTO profiles (id, name, role, student_id, department, year, section, status)
VALUES (
  '<STUDENT-AUTH-UUID>',
  'John Doe',
  'Student',
  'RA2311003010001',
  'CSE',
  2,
  'A',
  'Active'
);
*/


-- ─────────────────────────────────────────
-- Useful verification queries
-- ─────────────────────────────────────────
-- SELECT id, name, role, student_id, department, year, section, status FROM profiles;
-- SELECT * FROM get_dashboard_stats(CURRENT_DATE);
-- SELECT * FROM get_section_summary(CURRENT_DATE);
-- SELECT session, COUNT(*) FROM attendance WHERE date = CURRENT_DATE GROUP BY session;

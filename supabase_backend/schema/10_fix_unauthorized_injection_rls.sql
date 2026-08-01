-- ═══════════════════════════════════════════════════════════════
-- Migration 10: Hardening Attendance & Placement Drive RLS Policies
-- Fixes unauthorized attendance injection via direct REST API table inserts
-- ═══════════════════════════════════════════════════════════════

-- 1. ATTENDANCE TABLE HARDENING
-- Drop the overly permissive direct insert policy for Faculty/Admin.
-- Attendance rows MUST ONLY be inserted via the SECURITY DEFINER RPC `mark_attendance_safe`
-- (or via the admin service-role key on trusted server API routes).
DROP POLICY IF EXISTS "attendance: faculty insert" ON attendance;

-- Ensure authenticated users cannot directly INSERT into attendance table via REST
REVOKE INSERT ON TABLE attendance FROM authenticated, anon, PUBLIC;

-- 2. PLACEMENT DRIVE STUDENTS TABLE HARDENING
-- Drop direct write access policy for Faculty on placement_drive_students.
-- Placement drive attendance updates MUST go through the server API route `/api/admin/placement-drives/[id]/attendance`.
DROP POLICY IF EXISTS "placement_drive_students: admin and faculty modify" ON placement_drive_students;

-- Read policy remains intact (authenticated users can view placement drive eligibility & status)
-- Writes are now reserved for service-role API routes or Admin-gated procedures.
CREATE POLICY "placement_drive_students: admin modify"
  ON placement_drive_students FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'Admin'
  );

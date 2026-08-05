-- Migration 14: CDC Timetable Multi-Section & Multi-Faculty Allocations
-- Allows each period (1-8) per weekday to have zero, one, or multiple section-faculty allocations.

ALTER TABLE cdc_timetable
  ADD COLUMN IF NOT EXISTS allocations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN cdc_timetable.allocations IS
  'Array of section allocations per period: [{ id, section_name, subject, faculty_id, faculty_name }, ...]';

-- ═══════════════════════════════════════════════════════════════
-- Migration 12: Modular ERP — Feature Flags & CDC 8-Period Timetable
--
-- Adds the columns the frontend (ModuleContext, Admin Settings "Module
-- Management" and "CDC 8-Period Timetable" tabs) has been reading/writing
-- since the modular refactor, but which were never added to the live
-- session_settings table. Until this runs, every Settings save fails with
-- "column does not exist" because handleSaveSettings always sends the full
-- payload including these fields.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE session_settings
  ADD COLUMN IF NOT EXISTS module_training_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS module_cdc_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS module_drives_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS p1_start TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS p1_end   TIME NOT NULL DEFAULT '09:50',
  ADD COLUMN IF NOT EXISTS p2_start TIME NOT NULL DEFAULT '09:50',
  ADD COLUMN IF NOT EXISTS p2_end   TIME NOT NULL DEFAULT '10:40',
  ADD COLUMN IF NOT EXISTS p3_start TIME NOT NULL DEFAULT '10:50',
  ADD COLUMN IF NOT EXISTS p3_end   TIME NOT NULL DEFAULT '11:40',
  ADD COLUMN IF NOT EXISTS p4_start TIME NOT NULL DEFAULT '11:40',
  ADD COLUMN IF NOT EXISTS p4_end   TIME NOT NULL DEFAULT '12:30',
  ADD COLUMN IF NOT EXISTS p5_start TIME NOT NULL DEFAULT '13:20',
  ADD COLUMN IF NOT EXISTS p5_end   TIME NOT NULL DEFAULT '14:10',
  ADD COLUMN IF NOT EXISTS p6_start TIME NOT NULL DEFAULT '14:10',
  ADD COLUMN IF NOT EXISTS p6_end   TIME NOT NULL DEFAULT '15:00',
  ADD COLUMN IF NOT EXISTS p7_start TIME NOT NULL DEFAULT '15:10',
  ADD COLUMN IF NOT EXISTS p7_end   TIME NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS p8_start TIME NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS p8_end   TIME NOT NULL DEFAULT '16:50';

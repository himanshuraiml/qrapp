-- QR Attendance System — Supabase Schema
-- Run each file in order in the Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES  (extends auth.users for all roles)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('Admin', 'Faculty', 'Student')),
  -- Student-only fields
  student_id   TEXT        UNIQUE,
  department   TEXT,
  year         INTEGER     CHECK (year BETWEEN 1 AND 4),
  section      TEXT,        -- permanent home section of the student
  batch        TEXT,        -- training batch (A, B, C, ...); may change on promote/demote
  -- Shared
  status       TEXT        NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role       ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_dept       ON profiles(department, section, year);
CREATE INDEX IF NOT EXISTS idx_profiles_batch      ON profiles(batch);
CREATE INDEX IF NOT EXISTS idx_profiles_sort_student ON profiles(role, department, year, section, name);
CREATE INDEX IF NOT EXISTS idx_profiles_sort_faculty ON profiles(role, department, name);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();


-- ─────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      TEXT        NOT NULL,
  student_name    TEXT        NOT NULL,
  department      TEXT        NOT NULL,
  section         TEXT        NOT NULL,
  year            INTEGER     NOT NULL CHECK (year BETWEEN 1 AND 4),
  batch           TEXT,
  session         TEXT        NOT NULL CHECK (session IN ('FN1','FN2','AN1','AN2')),
  marked_by       UUID        NOT NULL REFERENCES auth.users(id),
  marked_by_name  TEXT        NOT NULL,
  date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, date, session)
);

CREATE INDEX IF NOT EXISTS idx_att_date        ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_att_student     ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_dept        ON attendance(department, section, year);
CREATE INDEX IF NOT EXISTS idx_att_batch       ON attendance(batch);
CREATE INDEX IF NOT EXISTS idx_att_session     ON attendance(session, date);
CREATE INDEX IF NOT EXISTS idx_att_marked_by   ON attendance(marked_by);
CREATE INDEX IF NOT EXISTS idx_attendance_report_sort ON attendance(date DESC, department, section, session, student_name);


-- ─────────────────────────────────────────
-- SESSION SETTINGS  (single-row config)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  morning_start    TIME    NOT NULL DEFAULT '08:00', -- Deprecated
  morning_end      TIME    NOT NULL DEFAULT '12:00', -- Deprecated
  afternoon_start  TIME    NOT NULL DEFAULT '13:00', -- Deprecated
  afternoon_end    TIME    NOT NULL DEFAULT '17:00', -- Deprecated
  fn1_start        TIME    NOT NULL DEFAULT '08:00',
  fn1_end          TIME    NOT NULL DEFAULT '11:00',
  fn2_start        TIME    NOT NULL DEFAULT '11:00',
  fn2_end          TIME    NOT NULL DEFAULT '13:00',
  an1_start        TIME    NOT NULL DEFAULT '13:00',
  an1_end          TIME    NOT NULL DEFAULT '15:00',
  an2_start        TIME    NOT NULL DEFAULT '15:00',
  an2_end          TIME    NOT NULL DEFAULT '17:00',
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO session_settings DEFAULT VALUES ON CONFLICT DO NOTHING;

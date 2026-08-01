-- ═══════════════════════════════════════════════════════════════
-- Migration 11: Immutable Audit Logs Schema & RLS Hardening
-- Addresses VAPT Vulnerability 8.7 (Audit Log Tampering Protection)
-- ═══════════════════════════════════════════════════════════════

-- 1. Create audit_logs table if it does not exist
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

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Read policy: Only Admins can view audit logs
DROP POLICY IF EXISTS "audit_logs: admin read" ON public.audit_logs;
CREATE POLICY "audit_logs: admin read"
  ON public.audit_logs FOR SELECT
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'Admin');

-- 4. Insert policy: Staff/System can write log entries
DROP POLICY IF EXISTS "audit_logs: staff insert" ON public.audit_logs;
CREATE POLICY "audit_logs: staff insert"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 5. Revoke UPDATE and DELETE permissions from standard client roles
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated, anon, PUBLIC;

-- 6. Trigger to prevent any attempted UPDATE or DELETE by non-service-role actors
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

-- ─────────────────────────────────────────
-- 15_institution_support.sql
-- Migration to support University Institution -> Branch -> Section -> Student hierarchy
-- ─────────────────────────────────────────

-- 1. Add institution column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS institution TEXT DEFAULT 'FET';

-- 2. Create index on institution for optimized directory query performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution ON profiles(institution);
CREATE INDEX IF NOT EXISTS idx_profiles_inst_dept ON profiles(institution, department, year, section);

-- 3. Update get_distinct_filters() RPC to include distinct institutions
CREATE OR REPLACE FUNCTION public.get_distinct_filters()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_institutions JSON;
  v_departments  JSON;
  v_sections     JSON;
BEGIN
  IF _my_role() NOT IN ('Faculty', 'Admin') THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF; 

  SELECT COALESCE(json_agg(DISTINCT institution), '[]') INTO v_institutions
  FROM profiles
  WHERE role = 'Student' AND institution IS NOT NULL AND institution != '';

  SELECT COALESCE(json_agg(DISTINCT department), '[]') INTO v_departments
  FROM profiles
  WHERE role = 'Student' AND department IS NOT NULL AND department != '';

  SELECT COALESCE(json_agg(DISTINCT section), '[]') INTO v_sections
  FROM profiles
  WHERE role = 'Student' AND section IS NOT NULL AND section != '';

  RETURN json_build_object(
    'institutions', v_institutions,
    'departments',  v_departments,
    'sections',     v_sections
  );
END;
$function$;

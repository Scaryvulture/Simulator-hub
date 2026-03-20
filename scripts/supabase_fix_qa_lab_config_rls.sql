-- Fix Supabase warning: RLS Disabled in Public for public.qa_lab_config
-- Safe to run multiple times.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'qa_lab_config'
  ) THEN
    RAISE NOTICE 'Table public.qa_lab_config does not exist. Skipping.';
    RETURN;
  END IF;
END $$;

ALTER TABLE public.qa_lab_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_lab_config FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.qa_lab_config FROM public;
REVOKE ALL ON TABLE public.qa_lab_config FROM anon;
REVOKE ALL ON TABLE public.qa_lab_config FROM authenticated;

GRANT ALL ON TABLE public.qa_lab_config TO service_role;
GRANT ALL ON TABLE public.qa_lab_config TO postgres;

DROP POLICY IF EXISTS "no_public_access" ON public.qa_lab_config;
CREATE POLICY "no_public_access"
ON public.qa_lab_config
FOR ALL
USING (false)
WITH CHECK (false);

COMMIT;

-- Quick verification:
-- SELECT relrowsecurity, relforcerowsecurity
-- FROM pg_class
-- WHERE oid = 'public.qa_lab_config'::regclass;

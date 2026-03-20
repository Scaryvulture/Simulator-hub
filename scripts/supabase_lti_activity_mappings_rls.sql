BEGIN;

ALTER TABLE public.lti_activity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_activity_mappings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lti_activity_mappings FROM anon;
REVOKE ALL ON TABLE public.lti_activity_mappings FROM authenticated;
REVOKE ALL ON TABLE public.lti_activity_mappings FROM public;

GRANT ALL ON TABLE public.lti_activity_mappings TO service_role;
GRANT ALL ON TABLE public.lti_activity_mappings TO postgres;

DROP POLICY IF EXISTS "no_public_access" ON public.lti_activity_mappings;

CREATE POLICY "no_public_access"
ON public.lti_activity_mappings
FOR ALL
USING (false)
WITH CHECK (false);

COMMIT;

-- Supabase RLS Lockdown for all tables
-- This script enables RLS and revokes public access for all tables to resolve security warnings.

BEGIN;

-- List of tables to lockdown
-- 1. users
-- 2. bots
-- 3. bot_assignments
-- 4. organization_bots
-- 5. sessions
-- 6. messages
-- 7. pricing_config
-- 8. organization_members
-- 9. bot_versions
-- 10. organizations
-- 11. auth_sessions
-- 12. qa_runs
-- 13. qa_suites
-- 14. qa_cases
-- 15. qa_results
-- 16. qa_artifacts
-- 17. question_banks
-- 18. session_cost_audits
-- 19. question_bank_questions
-- 20. tts_config
-- 21. qa_lab_config
-- 22. lti_activity_mappings

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'users',
        'bots',
        'bot_assignments',
        'organization_bots',
        'sessions',
        'messages',
        'pricing_config',
        'organization_members',
        'bot_versions',
        'organizations',
        'auth_sessions',
        'qa_runs',
        'qa_suites',
        'qa_cases',
        'qa_results',
        'qa_artifacts',
        'question_banks',
        'session_cost_audits',
        'question_bank_questions',
        'tts_config',
        'qa_lab_config',
        'lti_activity_mappings'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Check if table exists to avoid errors on fresh/partial databases
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            -- 1. Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

            -- 2. Revoke permissions from public/anon/authenticated
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM public', t);

            -- 3. Grant permissions to service_role (backend) and postgres (admin)
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO postgres', t);
            
            -- 4. Create a default "deny all" policy if no policy exists (implicit in RLS but good to be explicit or just rely on default deny)
            -- Note: Enabling RLS without policies default explicitly denies access to roles NOT bypassed (like postgres/service_role usually are).
            -- We are revoking grants anyway, so even with policies they wouldn't access it via PostgREST.
            
            RAISE NOTICE 'Locked down table: %', t;
        ELSE
            RAISE NOTICE 'Table not found, skipping: %', t;
        END IF;
    END LOOP;
END $$;

COMMIT;

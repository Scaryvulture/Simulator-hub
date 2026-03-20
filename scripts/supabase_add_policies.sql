-- Supabase RLS Policy Fix
-- This script adds an explicit "Deny All" policy to tables that have RLS enabled but no policies.
-- This resolves the "RLS Enabled No Policy" warning from the Supabase Linter.

BEGIN;

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
        -- Check if table exists
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            
            -- Drop existing policy if it exists (to be idempotent)
            EXECUTE format('DROP POLICY IF EXISTS "no_public_access" ON public.%I', t);

            -- Create an explicit deny policy
            -- "USING (false)" means no rows are ever visible/selectable/updatable by public/anon/authenticated roles.
            -- This adheres to the lockdown strategy while satisfying the linter requirement.
            EXECUTE format('CREATE POLICY "no_public_access" ON public.%I FOR ALL USING (false) WITH CHECK (false)', t);
            
            RAISE NOTICE 'Added deny-all policy to table: %', t;
        END IF;
    END LOOP;
END $$;

COMMIT;

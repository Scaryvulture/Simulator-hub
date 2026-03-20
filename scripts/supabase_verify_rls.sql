-- Verify RLS hardening for application tables in Supabase.
-- Run this in Supabase SQL Editor after applying lockdown scripts.

-- 1) RLS status by table
with app_tables as (
  select unnest(array[
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
    'session_cost_audits',
    'tts_config',
    'qa_lab_config',
    'lti_activity_mappings'
  ]::text[]) as table_name
)
select
  t.table_name,
  c.oid is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced
from app_tables t
left join pg_class c
  on c.relname = t.table_name
 and c.relnamespace = 'public'::regnamespace
order by t.table_name;

-- 2) Policy summary by table
with app_tables as (
  select unnest(array[
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
    'session_cost_audits',
    'tts_config',
    'qa_lab_config',
    'lti_activity_mappings'
  ]::text[]) as table_name
)
select
  t.table_name,
  count(p.policyname) as policy_count,
  coalesce(string_agg(p.policyname, ', ' order by p.policyname), '') as policy_names
from app_tables t
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = t.table_name
group by t.table_name
order by t.table_name;

-- 3) Grants for sensitive roles
with app_tables as (
  select unnest(array[
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
    'session_cost_audits',
    'tts_config',
    'qa_lab_config',
    'lti_activity_mappings'
  ]::text[]) as table_name
)
select
  t.table_name,
  g.grantee,
  g.privilege_type
from app_tables t
join information_schema.role_table_grants g
  on g.table_schema = 'public'
 and g.table_name = t.table_name
where g.grantee in ('public', 'anon', 'authenticated', 'service_role', 'postgres')
order by t.table_name, g.grantee, g.privilege_type;

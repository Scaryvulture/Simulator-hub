-- Supabase security hardening for public.bots
-- Strategy: keep bots internal (no anon/authenticated direct access).
-- Reason: this table contains sensitive fields (api_key, prompt ids, config).

begin;

-- 1) Ensure table exists
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_tables
    where schemaname = 'public' and tablename = 'bots'
  ) then
    raise exception 'Table public.bots does not exist';
  end if;
end
$$;

-- 2) Turn on RLS (and force it for defense-in-depth)
alter table public.bots enable row level security;
alter table public.bots force row level security;

-- 3) Remove common broad policies if they exist
drop policy if exists "bots_owner_only" on public.bots;
drop policy if exists "bots_public_read" on public.bots;
drop policy if exists "bots_write_authenticated" on public.bots;
drop policy if exists "bots_select_own" on public.bots;
drop policy if exists "bots_insert_own" on public.bots;
drop policy if exists "bots_update_own" on public.bots;
drop policy if exists "bots_delete_own" on public.bots;
drop policy if exists "bots_tenant_access" on public.bots;

-- 4) Explicitly block direct client roles
revoke all privileges on table public.bots from anon;
revoke all privileges on table public.bots from authenticated;

-- 5) Keep backend/service access
grant all privileges on table public.bots to service_role;

commit;

-- Optional verification queries (run after commit):
-- select relrowsecurity, relforcerowsecurity
-- from pg_class
-- where oid = 'public.bots'::regclass;
--
-- select policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename = 'bots';

-- Idempotent bootstrap + security hardening for Supabase (public schema)
-- You can run this script multiple times safely.
-- It creates base tables only if missing and enforces bots privacy via RLS.

begin;

-- Optional but recommended for UUID generation
create extension if not exists pgcrypto;

-- 1) Base tables (only created if missing)
create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  openai_prompt_id text not null,
  config jsonb not null default '{
    "scenarios": [],
    "flow_rules": {},
    "bypass_logic": {},
    "regex_patterns": {}
  }'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid references public.bots(id) on delete cascade,
  external_user_id text,
  lms_context jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  role text check (role in ('user', 'assistant', 'system')),
  content text not null,
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd decimal(10, 6) default 0,
  flow_tag text,
  created_at timestamptz default now()
);

-- 2) Indexes (created only if missing)
create index if not exists idx_messages_session
  on public.messages(session_id, created_at desc);

-- 3) RLS hardening for sensitive tables
alter table public.bots enable row level security;
alter table public.bots force row level security;
alter table public.sessions enable row level security;
alter table public.sessions force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;

-- Remove all existing policies on public.bots (idempotent and name-agnostic)
do $$
declare
  p record;
begin
  for p in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'bots'
  loop
    execute format('drop policy if exists %I on public.bots', p.polname);
  end loop;
end
$$;

-- Remove all existing policies on public.sessions (idempotent and name-agnostic)
do $$
declare
  p record;
begin
  for p in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'sessions'
  loop
    execute format('drop policy if exists %I on public.sessions', p.polname);
  end loop;
end
$$;

-- Remove all existing policies on public.messages (idempotent and name-agnostic)
do $$
declare
  p record;
begin
  for p in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'messages'
  loop
    execute format('drop policy if exists %I on public.messages', p.polname);
  end loop;
end
$$;

-- 4) Privileges: block anon/authenticated, keep service_role
revoke all privileges on table public.bots from public;
revoke all privileges on table public.bots from anon;
revoke all privileges on table public.bots from authenticated;
grant all privileges on table public.bots to service_role;

revoke all privileges on table public.sessions from public;
revoke all privileges on table public.sessions from anon;
revoke all privileges on table public.sessions from authenticated;
grant all privileges on table public.sessions to service_role;

revoke all privileges on table public.messages from public;
revoke all privileges on table public.messages from anon;
revoke all privileges on table public.messages from authenticated;
grant all privileges on table public.messages to service_role;

commit;

-- Verification queries (run separately if you want)
-- select relrowsecurity, relforcerowsecurity
-- from pg_class
-- where oid in ('public.bots'::regclass, 'public.sessions'::regclass, 'public.messages'::regclass);
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('bots', 'sessions', 'messages')
--   and grantee in ('anon', 'authenticated', 'service_role')
-- order by table_name, grantee, privilege_type;

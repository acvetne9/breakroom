-- Device-based row-level security.
--
-- Identity model: every visitor has an anonymous UUID (the "device id") that
-- is the primary key of their `profiles` row and is sent on every request as
-- the `x-device-id` header. There is no Supabase Auth sign-in. These policies
-- make the header the single test for "is this my row".
--
-- Known limitation: the header is client-controlled, so anyone who learns a
-- device id can act as that device. That is inherent to account-less identity;
-- the policies below at least stop *arbitrary* cross-device edits, which the
-- previous `temp_user_id IS NOT NULL` checks allowed.
--
-- This migration is idempotent and self-contained: it drops every existing
-- policy on the affected tables before recreating them, because the live
-- database has drifted from the committed migration history.

create or replace function public.current_device_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-device-id', '');
$$;

comment on function public.current_device_id() is
  'The x-device-id request header, or NULL when absent. Used by RLS policies.';

-- Drop all existing policies on the identity-scoped tables.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'posts', 'votes', 'role_votes', 'current_jobs', 'past_jobs', 'business_roles', 'businesses')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.votes          enable row level security;
alter table public.role_votes     enable row level security;
alter table public.current_jobs   enable row level security;
alter table public.past_jobs      enable row level security;
alter table public.business_roles enable row level security;
alter table public.businesses     enable row level security;

-- profiles: a device can only see and manage its own row.
create policy "profiles: read own"   on public.profiles for select using (id::text = public.current_device_id());
create policy "profiles: insert own" on public.profiles for insert with check (id::text = public.current_device_id());
create policy "profiles: update own" on public.profiles for update using (id::text = public.current_device_id());

-- posts: everyone reads; only the author's device writes.
create policy "posts: read all"    on public.posts for select using (true);
create policy "posts: insert own"  on public.posts for insert with check (user_id::text = public.current_device_id());
create policy "posts: update own"  on public.posts for update using (user_id::text = public.current_device_id());
create policy "posts: delete own"  on public.posts for delete using (user_id::text = public.current_device_id());

-- votes on posts: a device only ever sees or touches its own votes.
-- Totals are maintained by the SECURITY DEFINER trigger, not by reading this table.
create policy "votes: read own"   on public.votes for select using (user_id::text = public.current_device_id());
create policy "votes: insert own" on public.votes for insert with check (user_id::text = public.current_device_id());
create policy "votes: update own" on public.votes for update using (user_id::text = public.current_device_id());
create policy "votes: delete own" on public.votes for delete using (user_id::text = public.current_device_id());

-- votes on business roles: same rules.
create policy "role_votes: read own"   on public.role_votes for select using (user_id::text = public.current_device_id());
create policy "role_votes: insert own" on public.role_votes for insert with check (user_id::text = public.current_device_id());
create policy "role_votes: update own" on public.role_votes for update using (user_id::text = public.current_device_id());
create policy "role_votes: delete own" on public.role_votes for delete using (user_id::text = public.current_device_id());

-- job history: private to the device.
create policy "current_jobs: read own"   on public.current_jobs for select using (profile_id::text = public.current_device_id());
create policy "current_jobs: insert own" on public.current_jobs for insert with check (profile_id::text = public.current_device_id());
create policy "current_jobs: update own" on public.current_jobs for update using (profile_id::text = public.current_device_id());
create policy "current_jobs: delete own" on public.current_jobs for delete using (profile_id::text = public.current_device_id());

create policy "past_jobs: read own"   on public.past_jobs for select using (profile_id::text = public.current_device_id());
create policy "past_jobs: insert own" on public.past_jobs for insert with check (profile_id::text = public.current_device_id());
create policy "past_jobs: update own" on public.past_jobs for update using (profile_id::text = public.current_device_id());
create policy "past_jobs: delete own" on public.past_jobs for delete using (profile_id::text = public.current_device_id());

-- businesses: public read-only from the client. Writes happen through the
-- dashboard or service-role tooling.
create policy "businesses: read all" on public.businesses for select using (true);

-- business_roles: public read; any identified device may contribute a
-- role/salary row (the app does this when a user records a job). Vote totals
-- are trigger-maintained, so no client update/delete.
create policy "business_roles: read all"   on public.business_roles for select using (true);
create policy "business_roles: insert any" on public.business_roles for insert with check (public.current_device_id() is not null);

-- Make sure the anon role can reach the tables at all (RLS does the filtering).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.posts, public.votes, public.role_votes,
  public.current_jobs, public.past_jobs to anon, authenticated;
grant select on public.businesses to anon, authenticated;
grant select, insert on public.business_roles to anon, authenticated;
grant execute on function public.current_device_id() to anon, authenticated;

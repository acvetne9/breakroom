-- Posting limits enforced in the database, and a place to report business problems.

-- ---------------------------------------------------------------- rate limits
-- Count the caller's rows in a table over a window and refuse the insert when
-- over the cap. Raised with SQLSTATE P0429 so the client can recognise it.
create or replace function public.enforce_rate_limit(
  p_table text,
  p_user_column text,
  p_user_id uuid,
  p_window interval,
  p_max integer,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - $2',
    p_table, p_user_column
  ) into n using p_user_id, p_window;

  if n >= p_max then
    raise exception using message = p_message, errcode = 'P0429';
  end if;
end;
$$;

revoke all on function public.enforce_rate_limit(text, text, uuid, interval, integer, text) from public;

-- posts: 10 per 10 minutes, 60 per day (stories, comments and job updates alike)
create or replace function public.limit_posts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enforce_rate_limit('posts', 'user_id', new.user_id, interval '10 minutes', 10,
    'You are posting quickly. Please wait a few minutes before posting again.');
  perform public.enforce_rate_limit('posts', 'user_id', new.user_id, interval '1 day', 60,
    'You have reached the daily posting limit. Please try again tomorrow.');
  return new;
end;
$$;

drop trigger if exists limit_posts_before_insert on public.posts;
create trigger limit_posts_before_insert
  before insert on public.posts
  for each row execute function public.limit_posts();

-- business_roles: record who added a role so contributions can be limited (20 per day)
alter table public.business_roles
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_business_roles_created_by
  on public.business_roles (created_by, created_at desc)
  where created_by is not null;

create or replace function public.limit_business_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    perform public.enforce_rate_limit('business_roles', 'created_by', new.created_by, interval '1 day', 20,
      'You have added a lot of roles today. Please try again tomorrow.');
  end if;
  return new;
end;
$$;

drop trigger if exists limit_business_roles_before_insert on public.business_roles;
create trigger limit_business_roles_before_insert
  before insert on public.business_roles
  for each row execute function public.limit_business_roles();

-- Roles added from the client must be attributed to the calling device.
drop policy if exists "business_roles: insert any" on public.business_roles;
create policy "business_roles: insert own" on public.business_roles
  for insert with check (created_by::text = public.current_device_id());

-- ------------------------------------------------------------- business reports
-- "Something is wrong with this business": closed, wrong details, duplicate, other.
create table if not exists public.business_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  issue_type text not null check (issue_type in ('closed', 'wrong_details', 'duplicate', 'other')),
  details text,
  suggested_name text,
  suggested_address text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.business_reports is 'User reports about a business listing. Reviewed in the dashboard; status is set by hand.';

create index if not exists idx_business_reports_business on public.business_reports (business_id, created_at desc);
create index if not exists idx_business_reports_open on public.business_reports (created_at desc) where status = 'open';

alter table public.business_reports enable row level security;

create policy "business_reports: read own"   on public.business_reports for select using (profile_id::text = public.current_device_id());
create policy "business_reports: insert own" on public.business_reports for insert with check (profile_id::text = public.current_device_id());

grant select, insert on public.business_reports to anon, authenticated;

-- 10 reports per day per device
create or replace function public.limit_business_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enforce_rate_limit('business_reports', 'profile_id', new.profile_id, interval '1 day', 10,
    'You have sent a lot of reports today. Please try again tomorrow.');
  return new;
end;
$$;

drop trigger if exists limit_business_reports_before_insert on public.business_reports;
create trigger limit_business_reports_before_insert
  before insert on public.business_reports
  for each row execute function public.limit_business_reports();

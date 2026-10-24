-- Chicago as a second city.
--
-- The existing businesses / business_roles tables stay NYC-only. Chicago gets
-- its own pair (businesses_chicago / business_roles_chicago) cloned from them.
-- The user tables (posts, current_jobs, past_jobs, role_votes, business_reports)
-- are shared across cities and carry a `city` column that says which business
-- table their business_id / business_role_id points into.
--
-- Postgres foreign keys can't point at "one of two tables", so the old FKs from
-- the user tables to the NYC tables are replaced by trigger-based checks
-- (assert_city_business / assert_city_role) and cascade emulation
-- (cascade_business_delete / cascade_role_delete). PostgREST embeds that used
-- the posts -> businesses FK now go through the computed relationship
-- post_business(posts), which reads the businesses_all union view.
--
-- The two RPCs the map calls (get_businesses_in_viewport_slim, search_businesses)
-- take a `city` argument and pick the table with dynamic SQL so the search body
-- is written once.

-- ----------------------------------------------------------------- city tables

create table if not exists public.businesses_chicago (like public.businesses including all);
alter table public.businesses_chicago add column if not exists source_id text;
comment on table public.businesses_chicago is 'Chicago businesses, imported from OpenStreetMap (scripts/osm/). Same shape as businesses.';
comment on column public.businesses_chicago.source_id is 'OSM element id (node/123, way/456); unique so re-imports upsert.';
create unique index if not exists businesses_chicago_source_id_key on public.businesses_chicago (source_id);

drop trigger if exists sync_business_geom_trigger on public.businesses_chicago;
create trigger sync_business_geom_trigger
  before insert or update on public.businesses_chicago
  for each row execute function public.sync_business_geom();

drop trigger if exists update_businesses_chicago_updated_at on public.businesses_chicago;
create trigger update_businesses_chicago_updated_at
  before update on public.businesses_chicago
  for each row execute function public.update_updated_at_column();

alter table public.businesses_chicago enable row level security;
drop policy if exists "businesses_chicago: read all" on public.businesses_chicago;
create policy "businesses_chicago: read all" on public.businesses_chicago for select using (true);
grant select on public.businesses_chicago to anon, authenticated;

create table if not exists public.business_roles_chicago (like public.business_roles including all);
comment on table public.business_roles_chicago is 'Roles and pay for Chicago businesses. Same shape as business_roles.';
alter table public.business_roles_chicago
  drop constraint if exists business_roles_chicago_business_id_fkey,
  add constraint business_roles_chicago_business_id_fkey
    foreign key (business_id) references public.businesses_chicago(id) on delete cascade;
alter table public.business_roles_chicago
  drop constraint if exists business_roles_chicago_created_by_fkey,
  add constraint business_roles_chicago_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

drop trigger if exists update_business_roles_chicago_updated_at on public.business_roles_chicago;
create trigger update_business_roles_chicago_updated_at
  before update on public.business_roles_chicago
  for each row execute function public.update_updated_at_column();

-- One rate-limit function for both role tables: count rows in the table the
-- trigger fired on.
create or replace function public.limit_business_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    perform public.enforce_rate_limit(TG_TABLE_NAME, 'created_by', new.created_by, interval '1 day', 20,
      'You have added a lot of roles today. Please try again tomorrow.');
  end if;
  return new;
end;
$$;

drop trigger if exists limit_business_roles_chicago_before_insert on public.business_roles_chicago;
create trigger limit_business_roles_chicago_before_insert
  before insert on public.business_roles_chicago
  for each row execute function public.limit_business_roles();

alter table public.business_roles_chicago enable row level security;
drop policy if exists "business_roles_chicago: read all" on public.business_roles_chicago;
create policy "business_roles_chicago: read all" on public.business_roles_chicago for select using (true);
drop policy if exists "business_roles_chicago: insert own" on public.business_roles_chicago;
create policy "business_roles_chicago: insert own" on public.business_roles_chicago
  for insert with check (created_by::text = public.current_device_id());
grant select, insert on public.business_roles_chicago to anon, authenticated;

-- ------------------------------------------------------- city on user tables

alter table public.posts            add column if not exists city text not null default 'nyc';
alter table public.current_jobs     add column if not exists city text not null default 'nyc';
alter table public.past_jobs        add column if not exists city text not null default 'nyc';
alter table public.role_votes       add column if not exists city text not null default 'nyc';
alter table public.business_reports add column if not exists city text not null default 'nyc';

alter table public.posts            drop constraint if exists posts_city_check,            add constraint posts_city_check            check (city in ('nyc', 'chicago'));
alter table public.current_jobs     drop constraint if exists current_jobs_city_check,     add constraint current_jobs_city_check     check (city in ('nyc', 'chicago'));
alter table public.past_jobs        drop constraint if exists past_jobs_city_check,        add constraint past_jobs_city_check        check (city in ('nyc', 'chicago'));
alter table public.role_votes       drop constraint if exists role_votes_city_check,       add constraint role_votes_city_check       check (city in ('nyc', 'chicago'));
alter table public.business_reports drop constraint if exists business_reports_city_check, add constraint business_reports_city_check check (city in ('nyc', 'chicago'));

comment on column public.posts.city is 'Which city''s business table business_id points into (nyc | chicago). Also scopes the feed.';
comment on column public.role_votes.city is 'Which city''s role table business_role_id points into.';

-- The feed lists top-level, non-deleted posts for one city, newest first.
create index if not exists idx_posts_city_feed
  on public.posts (city, created_at desc)
  where is_deleted = false and is_comment is null;

-- ---------------------------------------------- integrity without foreign keys

alter table public.posts            drop constraint if exists posts_business_id_fkey;
alter table public.current_jobs     drop constraint if exists current_jobs_business_id_fkey;
alter table public.past_jobs        drop constraint if exists past_jobs_business_id_fkey;
alter table public.business_reports drop constraint if exists business_reports_business_id_fkey;
alter table public.role_votes       drop constraint if exists role_votes_business_role_id_fkey;

-- business_id must exist in the business table for the row's city.
create or replace function public.assert_city_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if new.business_id is null then
    return new;
  end if;
  if new.city = 'chicago' then
    select exists (select 1 from public.businesses_chicago b where b.id = new.business_id) into ok;
  else
    select exists (select 1 from public.businesses b where b.id = new.business_id) into ok;
  end if;
  if not ok then
    raise foreign_key_violation using message = format('business %s does not exist in city %s', new.business_id, new.city);
  end if;
  return new;
end;
$$;

create or replace function public.assert_city_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if new.city = 'chicago' then
    select exists (select 1 from public.business_roles_chicago r where r.id = new.business_role_id) into ok;
  else
    select exists (select 1 from public.business_roles r where r.id = new.business_role_id) into ok;
  end if;
  if not ok then
    raise foreign_key_violation using message = format('business role %s does not exist in city %s', new.business_role_id, new.city);
  end if;
  return new;
end;
$$;

drop trigger if exists assert_city_business on public.posts;
create trigger assert_city_business before insert or update of business_id, city on public.posts
  for each row execute function public.assert_city_business();
drop trigger if exists assert_city_business on public.current_jobs;
create trigger assert_city_business before insert or update of business_id, city on public.current_jobs
  for each row execute function public.assert_city_business();
drop trigger if exists assert_city_business on public.past_jobs;
create trigger assert_city_business before insert or update of business_id, city on public.past_jobs
  for each row execute function public.assert_city_business();
drop trigger if exists assert_city_business on public.business_reports;
create trigger assert_city_business before insert or update of business_id, city on public.business_reports
  for each row execute function public.assert_city_business();
drop trigger if exists assert_city_role on public.role_votes;
create trigger assert_city_role before insert or update of business_role_id, city on public.role_votes
  for each row execute function public.assert_city_role();

-- What the dropped FKs used to do on delete: set null on posts/jobs, cascade on reports and votes.
create or replace function public.cascade_business_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := TG_ARGV[0];
begin
  update public.posts        set business_id = null where city = c and business_id = old.id;
  update public.current_jobs set business_id = null where city = c and business_id = old.id;
  update public.past_jobs    set business_id = null where city = c and business_id = old.id;
  delete from public.business_reports where city = c and business_id = old.id;
  return old;
end;
$$;

create or replace function public.cascade_role_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := TG_ARGV[0];
begin
  delete from public.role_votes where city = c and business_role_id = old.id;
  return old;
end;
$$;

drop trigger if exists cascade_business_delete on public.businesses;
create trigger cascade_business_delete after delete on public.businesses
  for each row execute function public.cascade_business_delete('nyc');
drop trigger if exists cascade_business_delete on public.businesses_chicago;
create trigger cascade_business_delete after delete on public.businesses_chicago
  for each row execute function public.cascade_business_delete('chicago');
drop trigger if exists cascade_role_delete on public.business_roles;
create trigger cascade_role_delete after delete on public.business_roles
  for each row execute function public.cascade_role_delete('nyc');
drop trigger if exists cascade_role_delete on public.business_roles_chicago;
create trigger cascade_role_delete after delete on public.business_roles_chicago
  for each row execute function public.cascade_role_delete('chicago');

-- Vote totals land on the role table for the vote's city.
create or replace function public.update_role_votes_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid := coalesce(new.business_role_id, old.business_role_id);
  c text := coalesce(new.city, old.city);
  total integer;
begin
  select coalesce(count(*) filter (where vote_type = 'upvote') - count(*) filter (where vote_type = 'downvote'), 0)
    into total
  from public.role_votes
  where business_role_id = rid and city = c;

  if c = 'chicago' then
    update public.business_roles_chicago set votes_total = total where id = rid;
  else
    update public.business_roles set votes_total = total where id = rid;
  end if;
  return coalesce(new, old);
end;
$$;

-- Retiring a job keeps its city.
create or replace function public.move_current_job_to_past()
returns uuid
language plpgsql
security invoker
as $$
declare
  cj public.current_jobs%rowtype;
  new_id uuid;
begin
  select * into cj
  from public.current_jobs
  where profile_id::text = public.current_device_id()
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.past_jobs (profile_id, role, salary, location, business_name, business_id, time_period, started_at, city)
  values (cj.profile_id, coalesce(cj.role, ''), cj.salary, cj.location, cj.business_name, cj.business_id, cj.time_period, cj.created_at, cj.city)
  returning id into new_id;

  delete from public.current_jobs where id = cj.id;

  return new_id;
end;
$$;

-- ------------------------------------------------ feed join across both cities

create or replace view public.businesses_all
with (security_invoker = true)
as
  select 'nyc'::text as city, id, name, business_type, lat, lng, atmosphere, website, address from public.businesses
  union all
  select 'chicago'::text, id, name, business_type, lat, lng, atmosphere, website, address from public.businesses_chicago;
grant select on public.businesses_all to anon, authenticated;

-- PostgREST computed relationship: posts?select=*,post_business(id,name,lat,lng)
create or replace function public.post_business(p public.posts)
returns setof public.businesses_all
rows 1
language sql
stable
as $$
  select * from public.businesses_all b where b.id = p.business_id and b.city = p.city;
$$;
grant execute on function public.post_business(public.posts) to anon, authenticated;

-- ------------------------------------------------------------ RPCs with a city

create or replace function public.city_business_table(city text)
returns text
language sql
immutable
as $$
  select case city when 'nyc' then 'businesses' when 'chicago' then 'businesses_chicago' end;
$$;

create or replace function public.city_role_table(city text)
returns text
language sql
immutable
as $$
  select case city when 'nyc' then 'business_roles' when 'chicago' then 'business_roles_chicago' end;
$$;

drop function if exists public.get_businesses_in_viewport_slim(double precision, double precision, double precision, double precision, integer);

create or replace function public.get_businesses_in_viewport_slim(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  result_limit integer default 2000,
  city text default 'nyc'
)
returns table(id uuid, name text, lat double precision, lng double precision, business_type text)
language plpgsql
stable
as $$
declare
  tbl text := public.city_business_table(city);
begin
  if tbl is null then
    raise exception 'unknown city %', city using errcode = 'invalid_parameter_value';
  end if;
  return query execute format($q$
    select b.id, b.name, b.lat, b.lng, b.business_type
    from public.%I b
    where b.lat between $1 and $2
      and b.lng between $3 and $4
    order by b.id
    limit least(greatest($5, 1), 5000)
  $q$, tbl)
  using min_lat, max_lat, min_lng, max_lng, result_limit;
end;
$$;

grant execute on function public.get_businesses_in_viewport_slim(double precision, double precision, double precision, double precision, integer, text)
  to anon, authenticated;

drop function if exists public.search_businesses(text[], text, numeric, numeric, text, double precision, double precision, double precision, double precision, integer);

create or replace function public.search_businesses(
  terms text[] default '{}',
  phrase text default null,
  min_hourly numeric default null,
  max_hourly numeric default null,
  polygon_geojson text default null,
  min_lat double precision default null,
  max_lat double precision default null,
  min_lng double precision default null,
  max_lng double precision default null,
  result_limit integer default 100,
  city text default 'nyc'
)
returns table(
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  business_type text,
  address text,
  website text,
  atmosphere text[],
  score numeric,
  match_reasons text[]
)
language plpgsql
stable
as $$
declare
  btbl text := public.city_business_table(city);
  rtbl text := public.city_role_table(city);
begin
  if btbl is null then
    raise exception 'unknown city %', city using errcode = 'invalid_parameter_value';
  end if;

  -- Same query as 20260907170000_search_materialized.sql with the two tables
  -- substituted. $1 terms, $2 phrase, $3 min_hourly, $4 max_hourly,
  -- $5 polygon_geojson, $6..$9 min_lat/max_lat/min_lng/max_lng, $10 result_limit.
  return query execute format($q$
  with params as (
    select
      coalesce(array(select lower(trim(t)) from unnest($1::text[]) t where length(trim(t)) > 0), '{}'::text[]) as terms,
      nullif(lower(trim(coalesce($2::text, ''))), '') as phrase,
      case when $5::text is not null
           then ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)
      end as poly,
      least(greatest(coalesce($10::integer, 100), 1), 5000) as lim,
      ($6::double precision is not null and $7::double precision is not null and $8::double precision is not null and $9::double precision is not null) as has_box,
      ($3::numeric is not null or $4::numeric is not null) as has_pay
  ),
  text_hits as materialized (
    select distinct b.id
    from params p
    cross join lateral unnest(p.terms) as t(term)
    join public.%1$I b
      on b.name_norm like '%%' || t.term || '%%'
      or b.business_type ilike '%%' || t.term || '%%'
      or b.address ilike '%%' || t.term || '%%'
    union
    select b.id
    from public.%1$I b, params p
    where p.phrase is not null and length(p.phrase) >= 4 and b.name_norm %% p.phrase
  ),
  role_hits as materialized (
    select distinct br.business_id as id
    from params p
    cross join lateral unnest(p.terms) as t(term)
    join public.%2$I br on br.role ilike '%%' || t.term || '%%'
  ),
  pay_hits as materialized (
    select distinct br.business_id as id
    from public.%2$I br, params p
    where p.has_pay
      and br.hourly_rate between coalesce($3::numeric, 0) and coalesce($4::numeric, 1e9)
  ),
  matched as materialized (
    select id from text_hits
    union
    select id from role_hits
  ),
  candidates as (
    select b.id, b.name, b.lat, b.lng, b.business_type, b.address, b.website, b.atmosphere, b.name_norm
    from public.%1$I b, params p
    where (cardinality(p.terms) > 0 or p.poly is not null or p.has_box or p.has_pay)
      and (cardinality(p.terms) = 0 or exists (select 1 from matched m where m.id = b.id))
      and (not p.has_pay or exists (select 1 from pay_hits ph where ph.id = b.id))
      and (not p.has_box or (b.lat between $6::double precision and $7::double precision and b.lng between $8::double precision and $9::double precision))
      and (p.poly is null or (b.geom && p.poly and ST_Contains(p.poly, b.geom)))
  ),
  scored as (
    select
      c.*,
      cardinality(p.terms) as nterms,
      (select count(*) from unnest(p.terms) t where c.name_norm like '%%' || t || '%%') as name_hits,
      (select count(*) from unnest(p.terms) t where c.name_norm ~ ('\m' || t || '\M')) as name_word_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.business_type, '')) like '%%' || t || '%%') as type_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.address, '')) like '%%' || t || '%%') as address_hits,
      (select count(*) from unnest(p.terms) t
         where exists (select 1 from public.%2$I br where br.business_id = c.id and br.role ilike '%%' || t || '%%')) as role_hits,
      case when p.phrase is not null then similarity(c.name_norm, p.phrase) else 0 end as name_sim,
      (p.phrase is not null and c.name_norm = p.phrase) as exact_name,
      (p.phrase is not null and c.name_norm like p.phrase || '%%') as prefix_name
    from candidates c, params p
  )
  select
    s.id, s.name, s.lat, s.lng, s.business_type, s.address, s.website, s.atmosphere,
    (
      case when s.exact_name then 1000 else 0 end
      + case when s.prefix_name and not s.exact_name then 400 else 0 end
      + case when s.nterms > 0 and s.name_word_hits = s.nterms then 300 else 0 end
      + s.name_word_hits * 50
      + (s.name_hits - s.name_word_hits) * 15
      + s.role_hits * 60
      + s.type_hits * 30
      + s.address_hits * 20
      + round(s.name_sim * 200)
    )::numeric as score,
    array_remove(array[
      case when s.name_hits > 0 or s.exact_name or s.prefix_name then 'name' end,
      case when s.role_hits > 0 then 'role' end,
      case when s.type_hits > 0 then 'type' end,
      case when s.address_hits > 0 then 'address' end,
      case when s.name_hits = 0 and s.name_sim >= 0.3 then 'similar name' end,
      case when $5::text is not null then 'neighborhood' end,
      case when p.has_pay then 'pay' end
    ], null) as match_reasons
  from scored s, params p
  order by score desc, s.name asc
  limit (select lim from params)
  $q$, btbl, rtbl)
  using terms, phrase, min_hourly, max_hourly, polygon_geojson, min_lat, max_lat, min_lng, max_lng, result_limit;
end;
$$;

grant execute on function public.search_businesses(text[], text, numeric, numeric, text, double precision, double precision, double precision, double precision, integer, text)
  to anon, authenticated;

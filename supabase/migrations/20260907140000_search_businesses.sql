-- Server-side business search.
--
-- Replaces the client-side pipeline (PostgREST ilike filters + DataMuse
-- expansion + JavaScript scoring) with one function that understands the four
-- things people search for: neighborhood, business name, role, and pay.
--
--   terms            cleaned words from the query (stop words removed, punctuation stripped)
--   phrase           the same words joined, for exact / prefix / fuzzy name matching
--   min_hourly/max   pay range, already converted to an hourly rate by the client
--   polygon_geojson  neighborhood polygon (GeoJSON Polygon, lon/lat) or NULL
--   min/max lat/lng  optional viewport box
--
-- A business is returned when it matches ANY term by name, type, address or
-- role (or fuzzily by name), sits inside the polygon/box if given, and has at
-- least one role in the pay range if given. Rows carry a score for ranking and
-- the list of reasons they matched so the UI can explain results.

-- Hourly rate from a stored role salary. Salaries are free text ("17", "$18.50",
-- "60000/yr"); pay_period is 'HR' | 'MO' | 'YR' when the app recorded it.
create or replace function public.role_hourly_rate(salary text, pay_period text)
returns numeric
language sql
immutable
as $$
  select case
    when n is null then null
    when p in ('yr', 'year', 'yearly', 'annual', 'annually') or s ~* '(/\s*yr|year|annual)' then round(n / 2080, 2)
    when p in ('mo', 'month', 'monthly') or s ~* '(/\s*mo|month)' then round(n / 173, 2)
    else n
  end
  from (
    select
      case when regexp_replace(coalesce(salary, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
           then regexp_replace(coalesce(salary, ''), '[^0-9.]', '', 'g')::numeric
      end as n,
      lower(coalesce(pay_period, '')) as p,
      lower(coalesce(salary, '')) as s
  ) x;
$$;

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
  result_limit integer default 100
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
language sql
stable
as $$
  with params as (
    select
      coalesce(array(select lower(trim(t)) from unnest(terms) t where length(trim(t)) > 0), '{}'::text[]) as terms,
      nullif(lower(trim(coalesce(phrase, ''))), '') as phrase,
      case when polygon_geojson is not null
           then ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson), 4326)
      end as poly,
      least(greatest(coalesce(result_limit, 100), 1), 5000) as lim
  ),
  -- Businesses whose name / type / address contain any term (punctuation-insensitive),
  -- or whose name is fuzzily close to the whole phrase.
  text_hits as (
    select b.id
    from public.businesses b, params p
    where cardinality(p.terms) > 0
      and exists (
        select 1 from unnest(p.terms) t
        where regexp_replace(lower(b.name), '[^a-z0-9 ]', '', 'g') like '%' || t || '%'
           or lower(coalesce(b.business_type, '')) like '%' || t || '%'
           or lower(coalesce(b.address, '')) like '%' || t || '%'
      )
    union
    select b.id
    from public.businesses b, params p
    where p.phrase is not null
      and length(p.phrase) >= 4
      and similarity(regexp_replace(lower(b.name), '[^a-z0-9 ]', '', 'g'), p.phrase) >= 0.35
  ),
  -- Businesses with a role containing any term.
  role_hits as (
    select distinct br.business_id as id
    from public.business_roles br, params p
    where cardinality(p.terms) > 0
      and exists (select 1 from unnest(p.terms) t where lower(br.role) like '%' || t || '%')
  ),
  candidates as (
    select b.id, b.name, b.lat, b.lng, b.business_type, b.address, b.website, b.atmosphere,
           regexp_replace(lower(b.name), '[^a-z0-9 ]', '', 'g') as norm_name
    from public.businesses b, params p
    where (cardinality(p.terms) = 0 or b.id in (select id from text_hits) or b.id in (select id from role_hits))
      and (p.poly is null or ST_Contains(p.poly, b.geom))
      and (min_lat is null or max_lat is null or b.lat between min_lat and max_lat)
      and (min_lng is null or max_lng is null or b.lng between min_lng and max_lng)
      and (
        (min_hourly is null and max_hourly is null)
        or exists (
          select 1 from public.business_roles br
          where br.business_id = b.id
            and public.role_hourly_rate(br.salary, br.pay_period)
                between coalesce(min_hourly, 0) and coalesce(max_hourly, 1e9)
        )
      )
  ),
  scored as (
    select
      c.*,
      cardinality(p.terms) as nterms,
      (select count(*) from unnest(p.terms) t where c.norm_name like '%' || t || '%') as name_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.business_type, '')) like '%' || t || '%') as type_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.address, '')) like '%' || t || '%') as address_hits,
      (select count(*) from unnest(p.terms) t
         where exists (select 1 from public.business_roles br where br.business_id = c.id and lower(br.role) like '%' || t || '%')) as role_hits,
      case when p.phrase is not null then similarity(c.norm_name, p.phrase) else 0 end as name_sim,
      (p.phrase is not null and c.norm_name = p.phrase) as exact_name,
      (p.phrase is not null and c.norm_name like p.phrase || '%') as prefix_name
    from candidates c, params p
  )
  select
    s.id, s.name, s.lat, s.lng, s.business_type, s.address, s.website, s.atmosphere,
    (
      case when s.exact_name then 1000 else 0 end
      + case when s.prefix_name and not s.exact_name then 400 else 0 end
      + case when s.nterms > 0 and s.name_hits = s.nterms then 300 else 0 end
      + s.name_hits * 50
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
      case when s.name_hits = 0 and s.name_sim >= 0.35 then 'similar name' end,
      case when polygon_geojson is not null then 'neighborhood' end,
      case when min_hourly is not null or max_hourly is not null then 'pay' end
    ], null) as match_reasons
  from scored s, params p
  order by score desc, s.name asc
  limit (select lim from params);
$$;

grant execute on function public.role_hourly_rate(text, text) to anon, authenticated;
grant execute on function public.search_businesses(text[], text, numeric, numeric, text, double precision, double precision, double precision, double precision, integer)
  to anon, authenticated;

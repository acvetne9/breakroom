-- Make search_businesses fast enough for the 3 s anon statement timeout.
--
-- 1. A stored, punctuation-stripped lowercase copy of the name with a trigram
--    index, so "joes pizza" matches "Joe's Pizza" through the index instead of
--    a regexp over every row.
-- 2. Term matching rewritten as lateral joins so each term's LIKE / ILIKE can
--    use the trigram indexes on name_norm, business_type, address and role.
-- 3. An empty query (no terms, no area, no pay) returns nothing.

alter table public.businesses
  add column if not exists name_norm text
  generated always as (regexp_replace(lower(name), '[^a-z0-9 ]', '', 'g')) stored;

create index if not exists idx_businesses_name_norm_trgm
  on public.businesses using gin (name_norm gin_trgm_ops);

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
      least(greatest(coalesce(result_limit, 100), 1), 5000) as lim,
      (min_lat is not null and max_lat is not null and min_lng is not null and max_lng is not null) as has_box
  ),
  -- Any term found in name (punctuation-insensitive), type or address; or the
  -- whole phrase fuzzily close to the name. All four use trigram indexes.
  text_hits as (
    select distinct b.id
    from params p
    cross join lateral unnest(p.terms) as t(term)
    join public.businesses b
      on b.name_norm like '%' || t.term || '%'
      or b.business_type ilike '%' || t.term || '%'
      or b.address ilike '%' || t.term || '%'
    union
    select b.id
    from public.businesses b, params p
    where p.phrase is not null and length(p.phrase) >= 4 and b.name_norm % p.phrase
  ),
  role_hits as (
    select distinct br.business_id as id
    from params p
    cross join lateral unnest(p.terms) as t(term)
    join public.business_roles br on br.role ilike '%' || t.term || '%'
  ),
  candidates as (
    select b.id, b.name, b.lat, b.lng, b.business_type, b.address, b.website, b.atmosphere, b.name_norm
    from public.businesses b, params p
    where (cardinality(p.terms) > 0 or p.poly is not null or p.has_box or min_hourly is not null or max_hourly is not null)
      and (cardinality(p.terms) = 0 or b.id in (select id from text_hits) or b.id in (select id from role_hits))
      and (p.poly is null or ST_Contains(p.poly, b.geom))
      and (not p.has_box or (b.lat between min_lat and max_lat and b.lng between min_lng and max_lng))
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
      (select count(*) from unnest(p.terms) t where c.name_norm like '%' || t || '%') as name_hits,
      (select count(*) from unnest(p.terms) t where c.name_norm ~ ('\m' || t || '\M')) as name_word_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.business_type, '')) like '%' || t || '%') as type_hits,
      (select count(*) from unnest(p.terms) t where lower(coalesce(c.address, '')) like '%' || t || '%') as address_hits,
      (select count(*) from unnest(p.terms) t
         where exists (select 1 from public.business_roles br where br.business_id = c.id and br.role ilike '%' || t || '%')) as role_hits,
      case when p.phrase is not null then similarity(c.name_norm, p.phrase) else 0 end as name_sim,
      (p.phrase is not null and c.name_norm = p.phrase) as exact_name,
      (p.phrase is not null and c.name_norm like p.phrase || '%') as prefix_name
    from candidates c, params p
  )
  select
    s.id, s.name, s.lat, s.lng, s.business_type, s.address, s.website, s.atmosphere,
    (
      case when s.exact_name then 1000 else 0 end
      + case when s.prefix_name and not s.exact_name then 400 else 0 end
      + case when s.nterms > 0 and s.name_hits = s.nterms then 300 else 0 end
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
      case when polygon_geojson is not null then 'neighborhood' end,
      case when min_hourly is not null or max_hourly is not null then 'pay' end
    ], null) as match_reasons
  from scored s, params p
  order by score desc, s.name asc
  limit (select lim from params);
$$;

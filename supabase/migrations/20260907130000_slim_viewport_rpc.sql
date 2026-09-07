-- Lightweight viewport query for the map.
--
-- The map only needs coordinates and a name to draw a dot; roles, atmosphere,
-- address and website are fetched on click through getFullBusinessDetails.
-- The old get_businesses_in_viewport_no_ordering embeds every business's roles
-- as JSON, which made a wide viewport fetch ~4 MB. This one is ~80% smaller.
create or replace function public.get_businesses_in_viewport_slim(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  result_limit integer default 2000
)
returns table(id uuid, name text, lat double precision, lng double precision, business_type text)
language sql
stable
as $$
  select b.id, b.name, b.lat, b.lng, b.business_type
  from public.businesses b
  where b.lat between min_lat and max_lat
    and b.lng between min_lng and max_lng
  order by b.id
  limit least(greatest(result_limit, 1), 5000);
$$;

grant execute on function public.get_businesses_in_viewport_slim(double precision, double precision, double precision, double precision, integer)
  to anon, authenticated;

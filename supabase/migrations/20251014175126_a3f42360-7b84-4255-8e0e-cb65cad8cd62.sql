-- Create RPC function to fetch businesses with their roles in one query
CREATE OR REPLACE FUNCTION public.get_businesses_with_roles_near_point(
  center_lat double precision, 
  center_lng double precision, 
  radius_meters integer DEFAULT 20000,
  limit_count integer DEFAULT 100000
)
RETURNS TABLE(
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  address text,
  business_type text,
  website text,
  atmosphere text[],
  roles jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.address,
    b.business_type,
    b.website,
    b.atmosphere,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'role', br.role,
            'salary', br.salary,
            'votes_total', COALESCE(br.votes_total, 0)
          )
        )
        FROM business_roles br
        WHERE br.business_id = b.id
      ),
      '[]'::jsonb
    ) as roles
  FROM businesses b
  WHERE b.geom IS NOT NULL
    AND ST_DWithin(
      ST_Transform(b.geom, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857),
      radius_meters
    )
  ORDER BY ST_Distance(
    ST_Transform(b.geom, 3857),
    ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857)
  )
  LIMIT limit_count;
END;
$$;
-- Add unique constraint to role_votes only (votes already has it)
ALTER TABLE role_votes 
ADD CONSTRAINT role_votes_user_id_role_id_key 
UNIQUE (user_id, business_role_id);

-- Create RPC function that loads businesses with roles and user votes in one query
CREATE OR REPLACE FUNCTION get_businesses_with_roles_and_votes_near_point(
  center_lat FLOAT,
  center_lng FLOAT,
  radius_meters FLOAT,
  limit_count INT,
  user_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat FLOAT,
  lng FLOAT,
  atmosphere TEXT[],
  business_type TEXT,
  website TEXT,
  roles JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.address,
    b.lat,
    b.lng,
    b.atmosphere,
    b.business_type,
    b.website,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', br.id,
          'role', br.role,
          'salary', br.salary,
          'pay_period', br.pay_period,
          'votes_total', br.votes_total,
          'user_vote', CASE 
            WHEN rv.vote_type = 'upvote' THEN 'up'
            WHEN rv.vote_type = 'downvote' THEN 'down'
            ELSE NULL
          END
        ) ORDER BY br.votes_total DESC
      ) FILTER (WHERE br.id IS NOT NULL),
      '[]'::jsonb
    ) as roles
  FROM businesses b
  LEFT JOIN business_roles br ON br.business_id = b.id
  LEFT JOIN role_votes rv ON rv.business_role_id = br.id 
    AND rv.user_id = user_profile_id
  WHERE ST_DWithin(
    b.geom::geography,
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
    radius_meters
  )
  GROUP BY b.id, b.name, b.address, b.lat, b.lng, b.atmosphere, b.business_type, b.website
  ORDER BY ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326))
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;
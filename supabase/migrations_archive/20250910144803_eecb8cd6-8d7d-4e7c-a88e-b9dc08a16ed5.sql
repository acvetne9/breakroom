-- Fix function security by setting search_path
CREATE OR REPLACE FUNCTION sync_business_geom()
RETURNS TRIGGER AS $$
BEGIN
  -- Update geom column when lat/lng changes
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix get_businesses_near_point function security
CREATE OR REPLACE FUNCTION get_businesses_near_point(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 1000,
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.address,
    ST_Distance(
      ST_Transform(b.geom, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857)
    ) as distance_meters
  FROM businesses b
  WHERE b.geom IS NOT NULL
    AND ST_DWithin(
      ST_Transform(b.geom, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857),
      radius_meters
    )
  ORDER BY distance_meters
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add RLS policy for INSERT on businesses table since we have other policies but no INSERT
CREATE POLICY "Authenticated users can insert businesses" 
ON public.businesses 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Add RLS policy for UPDATE on businesses table
CREATE POLICY "Authenticated users can update businesses" 
ON public.businesses 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);
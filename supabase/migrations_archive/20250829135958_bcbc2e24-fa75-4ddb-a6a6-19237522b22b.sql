-- Fix function search path security issues
CREATE OR REPLACE FUNCTION public.update_business_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

-- Fix the businesses_in_bbox function search path
CREATE OR REPLACE FUNCTION public.businesses_in_bbox(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  query_limit integer DEFAULT 2000
)
RETURNS TABLE (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  atmosphere text[],
  salary text,
  business_type text,
  place_id text,
  website text,
  url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.atmosphere,
    b.salary,
    b.business_type,
    b.place_id,
    b.website,
    b.url,
    b.created_at,
    b.updated_at
  FROM public.businesses b
  WHERE ST_Intersects(
    b.geom,
    ST_MakeEnvelope(west, south, east, north, 4326)
  )
  LIMIT query_limit;
$$;
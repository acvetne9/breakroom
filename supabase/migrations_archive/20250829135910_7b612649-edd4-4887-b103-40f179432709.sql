-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column to businesses table
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- Create spatial index for fast viewport queries
CREATE INDEX IF NOT EXISTS idx_businesses_geom 
ON public.businesses USING GIST (geom);

-- Backfill existing data: convert lat/lng to PostGIS geometry
UPDATE public.businesses 
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- Create trigger to automatically update geom when lat/lng changes
CREATE OR REPLACE FUNCTION public.update_business_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_business_geom ON public.businesses;
CREATE TRIGGER trigger_update_business_geom
  BEFORE INSERT OR UPDATE OF lat, lng ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_geom();

-- Create optimized function for viewport queries
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
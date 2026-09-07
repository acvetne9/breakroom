-- Create function to sync lat/lng with geom column
CREATE OR REPLACE FUNCTION sync_business_geom()
RETURNS TRIGGER AS $$
BEGIN
  -- Update geom column when lat/lng changes
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically sync geom with lat/lng
CREATE TRIGGER sync_business_geom_trigger
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION sync_business_geom();

-- Update existing records to populate geom column
UPDATE public.businesses 
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE lat IS NOT NULL AND lng IS NOT NULL AND geom IS NULL;

-- Create spatial index for efficient location queries
CREATE INDEX IF NOT EXISTS idx_businesses_geom ON public.businesses USING GIST (geom);

-- Add function to get businesses by distance from point
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
$$ LANGUAGE plpgsql;
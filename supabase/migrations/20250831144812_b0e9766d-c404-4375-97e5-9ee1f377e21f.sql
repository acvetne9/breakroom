-- Drop the existing function and recreate it correctly
DROP FUNCTION IF EXISTS public.businesses_in_bbox(double precision, double precision, double precision, double precision, integer);

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
  website text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.atmosphere,
    b.salary,
    b.business_type,
    b.website
  FROM public.businesses b
  WHERE b.lat >= south 
    AND b.lat <= north 
    AND b.lng >= west 
    AND b.lng <= east
  LIMIT query_limit;
END;
$function$;
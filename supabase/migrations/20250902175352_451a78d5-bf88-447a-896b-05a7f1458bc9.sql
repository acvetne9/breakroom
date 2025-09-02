-- Create much simpler and faster search_businesses_global function
CREATE OR REPLACE FUNCTION public.search_businesses_global(
  search_query text DEFAULT NULL,
  search_role text DEFAULT NULL,
  search_business_type text DEFAULT NULL,
  min_hourly numeric DEFAULT NULL,
  max_hourly numeric DEFAULT NULL,
  result_limit integer DEFAULT 500,
  result_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  lat double precision,
  lng double precision,
  salary text,
  business_type text,
  website text,
  atmosphere text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Simple optimized query
  SELECT DISTINCT
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.salary,
    b.business_type,
    b.website,
    b.atmosphere
  FROM public.businesses b
  WHERE 
    (search_query IS NULL OR (
      lower(b.name) ILIKE '%' || lower(trim(search_query)) || '%'
      OR (b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(trim(search_query)) || '%')
    ))
    AND
    (search_business_type IS NULL OR (
      b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(search_business_type) || '%'
    ))
    AND
    (search_role IS NULL OR EXISTS (
      SELECT 1 FROM public.business_roles br 
      WHERE br.business_id = b.id 
        AND lower(br.role) ILIKE '%' || lower(search_role) || '%'
    ))
    AND
    (min_hourly IS NULL OR max_hourly IS NULL OR (
      -- Simple salary check - avoid complex regex
      b.salary IS NOT NULL 
      AND regexp_replace(b.salary, '[^0-9.]', '', 'g') != ''
      AND (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
    ))
  ORDER BY 
    b.name
  LIMIT result_limit OFFSET result_offset;
$$;
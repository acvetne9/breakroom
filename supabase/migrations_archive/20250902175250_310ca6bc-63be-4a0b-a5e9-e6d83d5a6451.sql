-- Optimize search_businesses_global function to prevent timeouts
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
  -- Simple text-only search (fastest path)
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
    CASE 
      -- Simple text search only
      WHEN search_query IS NOT NULL 
           AND search_role IS NULL 
           AND search_business_type IS NULL 
           AND min_hourly IS NULL 
           AND max_hourly IS NULL THEN
        (
          lower(b.name) ILIKE '%' || lower(trim(search_query)) || '%'
          OR (b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(trim(search_query)) || '%')
        )
      
      -- Complex search with roles/salary
      ELSE (
        -- Text matching
        (search_query IS NULL OR (
          lower(b.name) ILIKE '%' || lower(trim(search_query)) || '%'
          OR (b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(trim(search_query)) || '%')
          OR EXISTS (
            SELECT 1 FROM public.business_roles br 
            WHERE br.business_id = b.id 
              AND lower(br.role) ILIKE '%' || lower(trim(search_query)) || '%'
          )
        ))
        AND
        -- Business type matching
        (search_business_type IS NULL OR (
          b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(search_business_type) || '%'
        ))
        AND
        -- Role matching
        (search_role IS NULL OR EXISTS (
          SELECT 1 FROM public.business_roles br2 
          WHERE br2.business_id = b.id 
            AND lower(br2.role) ILIKE '%' || lower(search_role) || '%'
        ))
        AND
        -- Salary matching (simplified)
        (min_hourly IS NULL OR max_hourly IS NULL OR (
          -- Check business salary
          (b.salary IS NOT NULL AND (
            CASE 
              WHEN lower(b.salary) ~ '/hr' THEN (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
              WHEN lower(b.salary) ~ '/month' THEN ((regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 160) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
              WHEN lower(b.salary) ~ '/year' THEN ((regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 2080) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
              ELSE (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
            END
          ))
          OR
          -- Check role salaries
          EXISTS (
            SELECT 1 FROM public.business_roles br3 
            WHERE br3.business_id = b.id 
              AND br3.salary IS NOT NULL
              AND CASE 
                WHEN lower(br3.salary) ~ '/hr' THEN (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
                WHEN lower(br3.salary) ~ '/month' THEN ((regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 160) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
                WHEN lower(br3.salary) ~ '/year' THEN ((regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 2080) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
                ELSE (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) BETWEEN COALESCE(min_hourly, 0) AND COALESCE(max_hourly, 999999)
              END
          )
        ))
      )
    END
  ORDER BY 
    CASE WHEN search_query IS NOT NULL THEN 
      CASE 
        WHEN lower(b.name) = lower(trim(search_query)) THEN 1
        WHEN lower(b.name) ILIKE lower(trim(search_query)) || '%' THEN 2
        ELSE 3
      END
    ELSE 1
    END,
    b.name
  LIMIT result_limit OFFSET result_offset;
$$;
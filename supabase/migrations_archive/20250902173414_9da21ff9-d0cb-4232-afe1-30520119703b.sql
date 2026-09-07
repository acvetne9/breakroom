-- Enable pg_trgm extension for fast text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram indexes for fast text search
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm ON public.businesses USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_businesses_business_type_trgm ON public.businesses USING gin (business_type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_business_roles_role_trgm ON public.business_roles USING gin (role gin_trgm_ops);

-- Create global search RPC function
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_terms text[];
  term text;
BEGIN
  -- Parse search query into terms
  IF search_query IS NOT NULL AND length(trim(search_query)) > 0 THEN
    query_terms := string_to_array(lower(trim(search_query)), ' ');
  END IF;

  RETURN QUERY
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
  LEFT JOIN public.business_roles br ON b.id = br.business_id
  WHERE 
    -- Text search across business name and type
    (query_terms IS NULL OR (
      -- All terms must match (AND logic)
      NOT EXISTS (
        SELECT 1 FROM unnest(query_terms) AS term
        WHERE NOT (
          lower(b.name) % term OR 
          lower(b.name) ILIKE '%' || term || '%' OR
          (b.business_type IS NOT NULL AND (
            lower(b.business_type) % term OR 
            lower(b.business_type) ILIKE '%' || term || '%'
          )) OR
          (br.role IS NOT NULL AND (
            lower(br.role) % term OR 
            lower(br.role) ILIKE '%' || term || '%'
          ))
        )
      )
    ))
    -- Role filter
    AND (search_role IS NULL OR EXISTS (
      SELECT 1 FROM public.business_roles br2 
      WHERE br2.business_id = b.id 
      AND lower(br2.role) ILIKE '%' || lower(search_role) || '%'
    ))
    -- Business type filter
    AND (search_business_type IS NULL OR (
      b.business_type IS NOT NULL AND 
      lower(b.business_type) ILIKE '%' || lower(search_business_type) || '%'
    ))
    -- Salary filter (check both business and role salaries)
    AND (min_hourly IS NULL OR max_hourly IS NULL OR EXISTS (
      SELECT 1 FROM (
        -- Check business salary
        SELECT 
          CASE 
            WHEN b.salary IS NOT NULL THEN
              CASE 
                WHEN lower(b.salary) ~ '(/hr|hour)' THEN 
                  regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric
                WHEN lower(b.salary) ~ '(/month|monthly)' THEN 
                  (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 160
                WHEN lower(b.salary) ~ '(/year|yearly|annual)' THEN 
                  (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 2080
                ELSE 
                  regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric
              END
            ELSE NULL
          END AS hourly_rate
        UNION ALL
        -- Check role salaries
        SELECT 
          CASE 
            WHEN br3.salary IS NOT NULL THEN
              CASE 
                WHEN lower(br3.salary) ~ '(/hr|hour)' THEN 
                  regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric
                WHEN lower(br3.salary) ~ '(/month|monthly)' THEN 
                  (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 160
                WHEN lower(br3.salary) ~ '(/year|yearly|annual)' THEN 
                  (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 2080
                ELSE 
                  regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric
              END
            ELSE NULL
          END AS hourly_rate
        FROM public.business_roles br3 
        WHERE br3.business_id = b.id
      ) salary_checks
      WHERE hourly_rate IS NOT NULL 
      AND hourly_rate >= COALESCE(min_hourly, 0) 
      AND hourly_rate <= COALESCE(max_hourly, 999999)
    ))
  ORDER BY 
    -- Prioritize exact name matches
    CASE WHEN query_terms IS NOT NULL AND lower(b.name) = lower(search_query) THEN 0 ELSE 1 END,
    -- Then by similarity
    CASE WHEN query_terms IS NOT NULL THEN similarity(lower(b.name), lower(search_query)) ELSE 0 END DESC,
    b.name
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;
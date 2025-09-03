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
  WITH base AS (
    SELECT 
      b.id,
      b.name,
      b.lat,
      b.lng,
      b.salary,
      b.business_type,
      b.website,
      b.atmosphere,
      br.role,
      br.salary AS role_salary
    FROM public.businesses b
    LEFT JOIN public.business_roles br ON b.id = br.business_id
    WHERE 1=1
      AND (
        search_query IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(string_to_array(lower(trim(search_query)), ' ')) AS query_term
          WHERE NOT (
            lower(b.name) % query_term OR lower(b.name) ILIKE '%' || query_term || '%'
            OR (b.business_type IS NOT NULL AND (lower(b.business_type) % query_term OR lower(b.business_type) ILIKE '%' || query_term || '%'))
            OR (br.role IS NOT NULL AND (lower(br.role) % query_term OR lower(br.role) ILIKE '%' || query_term || '%'))
          )
        )
      )
      AND (
        search_role IS NULL OR EXISTS (
          SELECT 1 FROM public.business_roles br2 
          WHERE br2.business_id = b.id 
            AND lower(br2.role) ILIKE '%' || lower(search_role) || '%'
        )
      )
      AND (
        search_business_type IS NULL OR (
          b.business_type IS NOT NULL AND lower(b.business_type) ILIKE '%' || lower(search_business_type) || '%'
        )
      )
      AND (
        min_hourly IS NULL OR max_hourly IS NULL OR EXISTS (
          SELECT 1 FROM (
            SELECT CASE 
              WHEN b.salary IS NOT NULL THEN (
                CASE 
                  WHEN lower(b.salary) ~ '(/hr|hour)' THEN regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric
                  WHEN lower(b.salary) ~ '(/month|monthly)' THEN (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 160
                  WHEN lower(b.salary) ~ '(/year|yearly|annual)' THEN (regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric) / 2080
                  ELSE regexp_replace(b.salary, '[^0-9.]', '', 'g')::numeric
                END
              )
              ELSE NULL
            END AS hourly_rate
            UNION ALL
            SELECT CASE 
              WHEN br3.salary IS NOT NULL THEN (
                CASE 
                  WHEN lower(br3.salary) ~ '(/hr|hour)' THEN regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric
                  WHEN lower(br3.salary) ~ '(/month|monthly)' THEN (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 160
                  WHEN lower(br3.salary) ~ '(/year|yearly|annual)' THEN (regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric) / 2080
                  ELSE regexp_replace(br3.salary, '[^0-9.]', '', 'g')::numeric
                END
              )
              ELSE NULL
            END AS hourly_rate
            FROM public.business_roles br3 WHERE br3.business_id = b.id
          ) s
          WHERE hourly_rate IS NOT NULL 
            AND hourly_rate >= COALESCE(min_hourly, 0) 
            AND hourly_rate <= COALESCE(max_hourly, 999999)
        )
      )
  )
  SELECT DISTINCT ON (id)
    id,
    name,
    lat,
    lng,
    salary,
    business_type,
    website,
    atmosphere
  FROM base
  ORDER BY id,
    CASE WHEN search_query IS NOT NULL THEN similarity(lower(name), lower(search_query)) ELSE 0 END DESC,
    name
  LIMIT result_limit OFFSET result_offset;
$$;
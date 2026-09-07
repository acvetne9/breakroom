-- Baseline schema, dumped from the live project on 2026-09-07 with:
--   pg_dump --schema=public --schema-only --no-owner --no-privileges
-- Older migrations were archived in supabase/migrations_archive; the remote
-- migration history was repaired to treat this file as the only applied version.
-- Extensions live in the `extensions` schema on Supabase and are not part of a
-- public-schema dump, so they are declared here for fresh databases.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: businesses_in_bbox(double precision, double precision, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.businesses_in_bbox(west double precision, south double precision, east double precision, north double precision, query_limit integer DEFAULT 2000) RETURNS TABLE(id uuid, name text, lat double precision, lng double precision, atmosphere text[], salary text, business_type text, website text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: current_device_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_device_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-device-id', '');
$$;


--
-- Name: FUNCTION current_device_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_device_id() IS 'The x-device-id request header, or NULL when absent. Used by RLS policies.';


--
-- Name: get_businesses_in_viewport_grid_sampled(double precision, double precision, double precision, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_in_viewport_grid_sampled(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, result_limit integer DEFAULT 1000, user_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, address text, lat double precision, lng double precision, business_type text, atmosphere text[], website text, roles jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  grid_size INT;
  lat_step FLOAT;
  lng_step FLOAT;
  businesses_per_cell INT;
BEGIN
  grid_size := CEIL(SQRT(result_limit / 10.0));
  lat_step := (max_lat - min_lat) / grid_size;
  lng_step := (max_lng - min_lng) / grid_size;
  businesses_per_cell := CEIL(result_limit::FLOAT / (grid_size * grid_size));

  RETURN QUERY
  WITH grid_cells AS (
    SELECT 
      b.id, b.name, b.address, b.lat, b.lng,
      b.business_type, b.atmosphere, b.website,
      FLOOR((b.lat - min_lat) / lat_step) as lat_cell,
      FLOOR((b.lng - min_lng) / lng_step) as lng_cell,
      ROW_NUMBER() OVER (
        PARTITION BY 
          FLOOR((b.lat - min_lat) / lat_step),
          FLOOR((b.lng - min_lng) / lng_step)
        ORDER BY RANDOM()
      ) as cell_rank
    FROM businesses b
    WHERE 
      b.lat BETWEEN min_lat AND max_lat
      AND b.lng BETWEEN min_lng AND max_lng
      AND b.lat IS NOT NULL
      AND b.lng IS NOT NULL
  )
  SELECT 
    gc.id, gc.name, gc.address, gc.lat, gc.lng,
    gc.business_type, gc.atmosphere, gc.website,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'role', br.role,
            'salary', br.salary,
            'pay_period', br.pay_period,
            'votes_total', COALESCE(br.votes_total, 0),
            'user_vote', CASE 
              WHEN rv.vote_type = 'upvote' THEN 'up'
              WHEN rv.vote_type = 'downvote' THEN 'down'
              ELSE NULL
            END
          )
          ORDER BY br.votes_total DESC, br.created_at ASC
        )
        FROM business_roles br
        LEFT JOIN role_votes rv ON rv.business_role_id = br.id AND rv.user_id = user_profile_id
        WHERE br.business_id = gc.id
      ),
      '[]'::jsonb
    ) as roles
  FROM grid_cells gc
  WHERE cell_rank <= businesses_per_cell
  LIMIT result_limit;
END;
$$;


--
-- Name: get_businesses_in_viewport_no_ordering(double precision, double precision, double precision, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_in_viewport_no_ordering(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, result_limit integer DEFAULT 1000, user_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, address text, lat double precision, lng double precision, business_type text, atmosphere text[], website text, roles jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.address,
    b.lat,
    b.lng,
    b.business_type,
    b.atmosphere,
    b.website,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'role', br.role,
            'salary', br.salary,
            'pay_period', br.pay_period,
            'votes_total', COALESCE(br.votes_total, 0),
            'user_vote', CASE 
              WHEN rv.vote_type = 'upvote' THEN 'up'
              WHEN rv.vote_type = 'downvote' THEN 'down'
              ELSE NULL
            END
          )
          ORDER BY br.votes_total DESC, br.created_at ASC
        )
        FROM business_roles br
        LEFT JOIN role_votes rv ON rv.business_role_id = br.id AND rv.user_id = user_profile_id
        WHERE br.business_id = b.id
      ),
      '[]'::jsonb
    ) as roles
  FROM businesses b
  WHERE 
    b.lat BETWEEN min_lat AND max_lat
    AND b.lng BETWEEN min_lng AND max_lng
  ORDER BY b.id  -- Simple, no distance calculation
  LIMIT result_limit;
END;
$$;


--
-- Name: get_businesses_in_viewport_ordered(double precision, double precision, double precision, double precision, double precision, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_in_viewport_ordered(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, center_lat double precision, center_lng double precision, result_limit integer DEFAULT 1000, user_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, address text, lat double precision, lng double precision, business_type text, atmosphere text[], website text, roles jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.address,
    b.lat,
    b.lng,
    b.business_type,
    b.atmosphere,
    b.website,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'role', br.role,
            'salary', br.salary,
            'pay_period', br.pay_period,
            'votes_total', COALESCE(br.votes_total, 0),
            'user_vote', CASE 
              WHEN rv.vote_type = 'upvote' THEN 'up'
              WHEN rv.vote_type = 'downvote' THEN 'down'
              ELSE NULL
            END
          )
          ORDER BY br.votes_total DESC, br.created_at ASC
        )
        FROM business_roles br
        LEFT JOIN role_votes rv ON rv.business_role_id = br.id AND rv.user_id = user_profile_id
        WHERE br.business_id = b.id
      ),
      '[]'::jsonb
    ) as roles
  FROM businesses b
  WHERE 
    b.lat BETWEEN min_lat AND max_lat
    AND b.lng BETWEEN min_lng AND max_lng
  ORDER BY 
    -- FIX: Use simple Pythagorean distance (much faster, accurate enough for city-scale)
    -- This avoids the ST_Distance issue and is 10x faster
    (
      (b.lat - center_lat) * (b.lat - center_lat) + 
      (b.lng - center_lng) * (b.lng - center_lng)
    ) ASC
  LIMIT result_limit;
END;
$$;


--
-- Name: get_businesses_near_point(double precision, double precision, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_near_point(center_lat double precision, center_lng double precision, radius_meters integer DEFAULT 1000, limit_count integer DEFAULT 100) RETURNS TABLE(id uuid, name text, lat double precision, lng double precision, address text, distance_meters double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_businesses_with_roles_and_votes_near_point(double precision, double precision, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_with_roles_and_votes_near_point(center_lat double precision, center_lng double precision, radius_meters double precision, limit_count integer, user_profile_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, address text, lat double precision, lng double precision, atmosphere text[], business_type text, website text, roles jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
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
$$;


--
-- Name: get_businesses_with_roles_near_point(double precision, double precision, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_businesses_with_roles_near_point(center_lat double precision, center_lng double precision, radius_meters integer DEFAULT 20000, limit_count integer DEFAULT 100000) RETURNS TABLE(id uuid, name text, lat double precision, lng double precision, address text, business_type text, website text, atmosphere text[], roles jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.lat,
    b.lng,
    b.address,
    b.business_type,
    b.website,
    b.atmosphere,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'role', br.role,
            'salary', br.salary,
            'votes_total', COALESCE(br.votes_total, 0)
          )
        )
        FROM business_roles br
        WHERE br.business_id = b.id
      ),
      '[]'::jsonb
    ) as roles
  FROM businesses b
  WHERE b.geom IS NOT NULL
    AND ST_DWithin(
      ST_Transform(b.geom, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857),
      radius_meters
    )
  ORDER BY ST_Distance(
    ST_Transform(b.geom, 3857),
    ST_Transform(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326), 3857)
  )
  LIMIT limit_count;
END;
$$;


--
-- Name: search_businesses_global(text, text, text, numeric, numeric, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_businesses_global(search_query text DEFAULT NULL::text, search_role text DEFAULT NULL::text, search_business_type text DEFAULT NULL::text, min_hourly numeric DEFAULT NULL::numeric, max_hourly numeric DEFAULT NULL::numeric, result_limit integer DEFAULT 500, result_offset integer DEFAULT 0) RETURNS TABLE(id uuid, name text, lat double precision, lng double precision, salary text, business_type text, website text, atmosphere text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: sync_business_geom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_business_geom() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update geom column when lat/lng changes
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_business_geom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_business_geom() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_past_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_past_jobs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_post_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_post_vote_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Update the votes_total for the post
  UPDATE public.posts 
  SET votes_total = (
    SELECT COALESCE(SUM(
      CASE 
        WHEN vote_type = 'upvote' THEN 1 
        WHEN vote_type = 'downvote' THEN -1 
        ELSE 0 
      END
    ), 0)
    FROM public.votes 
    WHERE post_id = COALESCE(NEW.post_id, OLD.post_id)
  )
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_post_votes_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_post_votes_total() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  -- Get the post_id from NEW or OLD
  IF TG_OP = 'DELETE' THEN
    target_post_id := OLD.post_id;
  ELSE
    target_post_id := NEW.post_id;
  END IF;
  
  -- Update the post's votes_total
  UPDATE posts
  SET votes_total = (
    SELECT COUNT(CASE WHEN vote_type = 'upvote' THEN 1 END) - 
           COUNT(CASE WHEN vote_type = 'downvote' THEN 1 END)
    FROM votes
    WHERE post_id = target_post_id
  )
  WHERE id = target_post_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_role_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_role_vote_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Calculate total votes (upvotes - downvotes)
  UPDATE public.business_roles 
  SET votes_total = (
    SELECT COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
           COUNT(*) FILTER (WHERE vote_type = 'downvote')
    FROM public.role_votes 
    WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id)
  )
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_role_votes_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_role_votes_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.business_roles 
  SET votes_total = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE vote_type = 'upvote') - 
      COUNT(*) FILTER (WHERE vote_type = 'downvote'),
      0
    )
    FROM public.role_votes 
    WHERE business_role_id = COALESCE(NEW.business_role_id, OLD.business_role_id)
  )
  WHERE id = COALESCE(NEW.business_role_id, OLD.business_role_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: business_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    role text NOT NULL,
    salary text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pay_period text,
    votes_total integer DEFAULT 0
);


--
-- Name: COLUMN business_roles.pay_period; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_roles.pay_period IS 'context of salary (hr/mo/yr)';


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    business_type text,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    atmosphere text[] DEFAULT '{}'::text[],
    website text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    geom public.geometry(Point,4326),
    address text
);


--
-- Name: COLUMN businesses.address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.businesses.address IS 'the physical address of the business';


--
-- Name: current_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.current_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    role text,
    salary real,
    location text,
    time_period text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    business_name text,
    business_id uuid
);


--
-- Name: COLUMN current_jobs.business_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.current_jobs.business_id IS 'Links to the businesses table if the business exists in our database';


--
-- Name: past_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.past_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    salary real,
    location text,
    time_period text,
    created_at timestamp with time zone DEFAULT now(),
    profile_id uuid NOT NULL,
    business_name text,
    updated_at timestamp with time zone DEFAULT now(),
    business_id uuid
);


--
-- Name: COLUMN past_jobs.business_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.past_jobs.business_id IS 'Links to the businesses table if the business exists in our database';


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    job_role text,
    salary integer,
    business_id uuid,
    created_at text DEFAULT now(),
    post_type text NOT NULL,
    is_comment uuid,
    votes_total integer DEFAULT 0 NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT posts_post_type_check CHECK ((post_type = ANY (ARRAY['job_update'::text, 'story'::text, 'past_job'::text])))
);


--
-- Name: COLUMN posts.business_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.business_id IS 'business attached to the post';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    browser_fingerprint text
);


--
-- Name: COLUMN profiles.browser_fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.browser_fingerprint IS 'Browser fingerprint for device recovery when localStorage is cleared';


--
-- Name: role_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    business_role_id uuid NOT NULL,
    vote_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text])))
);


--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    post_id uuid NOT NULL,
    vote_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text])))
);


--
-- Name: business_roles business_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_roles
    ADD CONSTRAINT business_roles_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: current_jobs current_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.current_jobs
    ADD CONSTRAINT current_jobs_pkey PRIMARY KEY (id);


--
-- Name: current_jobs current_jobs_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.current_jobs
    ADD CONSTRAINT current_jobs_user_id_key UNIQUE (profile_id);


--
-- Name: past_jobs past_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_jobs
    ADD CONSTRAINT past_jobs_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: role_votes role_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_votes
    ADD CONSTRAINT role_votes_pkey PRIMARY KEY (id);


--
-- Name: role_votes role_votes_user_id_business_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_votes
    ADD CONSTRAINT role_votes_user_id_business_role_id_key UNIQUE (user_id, business_role_id);


--
-- Name: role_votes role_votes_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_votes
    ADD CONSTRAINT role_votes_user_id_role_id_key UNIQUE (user_id, business_role_id);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: votes votes_user_id_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_post_id_key UNIQUE (user_id, post_id);


--
-- Name: idx_business_roles_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_roles_business_id ON public.business_roles USING btree (business_id);


--
-- Name: idx_business_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_roles_role ON public.business_roles USING btree (role);


--
-- Name: idx_business_roles_role_salary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_roles_role_salary ON public.business_roles USING btree (role, salary);


--
-- Name: idx_business_roles_role_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_roles_role_trgm ON public.business_roles USING gin (role public.gin_trgm_ops);


--
-- Name: idx_business_roles_votes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_roles_votes ON public.business_roles USING btree (votes_total DESC NULLS LAST);


--
-- Name: idx_businesses_address_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_address_trgm ON public.businesses USING gin (address public.gin_trgm_ops);


--
-- Name: idx_businesses_business_type_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_business_type_trgm ON public.businesses USING gin (business_type public.gin_trgm_ops);


--
-- Name: idx_businesses_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_coords ON public.businesses USING btree (lat, lng);


--
-- Name: idx_businesses_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_created_at ON public.businesses USING btree (created_at DESC);


--
-- Name: idx_businesses_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_geom ON public.businesses USING gist (geom);


--
-- Name: idx_businesses_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_lat_lng ON public.businesses USING btree (lat, lng);


--
-- Name: idx_businesses_location_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_location_gist ON public.businesses USING gist (public.st_setsrid(public.st_makepoint(lng, lat), 4326));


--
-- Name: idx_businesses_name_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_name_coords ON public.businesses USING btree (name, lat, lng);


--
-- Name: idx_businesses_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_name_trgm ON public.businesses USING gin (name public.gin_trgm_ops);


--
-- Name: idx_businesses_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_updated_at ON public.businesses USING btree (updated_at DESC);


--
-- Name: idx_current_jobs_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_current_jobs_business_id ON public.current_jobs USING btree (business_id);


--
-- Name: idx_current_jobs_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_current_jobs_location ON public.current_jobs USING btree (location) WHERE (location IS NOT NULL);


--
-- Name: idx_current_jobs_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_current_jobs_profile_id ON public.current_jobs USING btree (profile_id);


--
-- Name: idx_past_jobs_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_past_jobs_business_id ON public.past_jobs USING btree (business_id);


--
-- Name: idx_past_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_past_jobs_created_at ON public.past_jobs USING btree (created_at DESC);


--
-- Name: idx_past_jobs_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_past_jobs_profile_id ON public.past_jobs USING btree (profile_id);


--
-- Name: idx_posts_business_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_business_created ON public.posts USING btree (business_id, created_at DESC) WHERE (business_id IS NOT NULL);


--
-- Name: idx_posts_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_business_id ON public.posts USING btree (business_id);


--
-- Name: idx_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created_at ON public.posts USING btree (created_at DESC);


--
-- Name: idx_posts_is_comment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_is_comment ON public.posts USING btree (is_comment) WHERE (is_comment IS NOT NULL);


--
-- Name: idx_posts_post_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_post_type ON public.posts USING btree (post_type) WHERE (post_type IS NOT NULL);


--
-- Name: idx_profiles_browser_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_browser_fingerprint ON public.profiles USING btree (browser_fingerprint);


--
-- Name: idx_role_votes_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_votes_role_id ON public.role_votes USING btree (business_role_id);


--
-- Name: idx_role_votes_user_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_votes_user_role ON public.role_votes USING btree (user_id, business_role_id);


--
-- Name: businesses sync_business_geom_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_business_geom_trigger BEFORE INSERT OR UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.sync_business_geom();


--
-- Name: businesses trigger_update_business_geom; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_business_geom BEFORE INSERT OR UPDATE OF lat, lng ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_business_geom();


--
-- Name: business_roles update_business_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_roles_updated_at BEFORE UPDATE ON public.business_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: businesses update_businesses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: current_jobs update_current_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_current_jobs_updated_at BEFORE UPDATE ON public.current_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: past_jobs update_past_jobs_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_past_jobs_updated_at_trigger BEFORE UPDATE ON public.past_jobs FOR EACH ROW EXECUTE FUNCTION public.update_past_jobs_updated_at();


--
-- Name: votes update_post_votes_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_votes_on_delete AFTER DELETE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.update_post_votes_total();


--
-- Name: votes update_post_votes_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_votes_on_insert AFTER INSERT ON public.votes FOR EACH ROW EXECUTE FUNCTION public.update_post_votes_total();


--
-- Name: votes update_post_votes_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_votes_on_update AFTER UPDATE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.update_post_votes_total();


--
-- Name: votes update_post_votes_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_votes_trigger AFTER INSERT OR DELETE OR UPDATE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.update_post_vote_count();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: role_votes update_role_votes_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_role_votes_count AFTER INSERT OR DELETE OR UPDATE ON public.role_votes FOR EACH ROW EXECUTE FUNCTION public.update_role_vote_count();


--
-- Name: role_votes update_role_votes_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_role_votes_trigger AFTER INSERT OR DELETE OR UPDATE ON public.role_votes FOR EACH ROW EXECUTE FUNCTION public.update_role_votes_total();


--
-- Name: business_roles business_roles_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_roles
    ADD CONSTRAINT business_roles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: current_jobs current_jobs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.current_jobs
    ADD CONSTRAINT current_jobs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: past_jobs past_jobs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.past_jobs
    ADD CONSTRAINT past_jobs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: posts posts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: role_votes role_votes_business_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_votes
    ADD CONSTRAINT role_votes_business_role_id_fkey FOREIGN KEY (business_role_id) REFERENCES public.business_roles(id) ON DELETE CASCADE;


--
-- Name: votes votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: business_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: business_roles business_roles: insert any; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_roles: insert any" ON public.business_roles FOR INSERT WITH CHECK ((public.current_device_id() IS NOT NULL));


--
-- Name: business_roles business_roles: read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "business_roles: read all" ON public.business_roles FOR SELECT USING (true);


--
-- Name: businesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses businesses: read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "businesses: read all" ON public.businesses FOR SELECT USING (true);


--
-- Name: current_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.current_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: current_jobs current_jobs: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "current_jobs: delete own" ON public.current_jobs FOR DELETE USING (((profile_id)::text = public.current_device_id()));


--
-- Name: current_jobs current_jobs: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "current_jobs: insert own" ON public.current_jobs FOR INSERT WITH CHECK (((profile_id)::text = public.current_device_id()));


--
-- Name: current_jobs current_jobs: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "current_jobs: read own" ON public.current_jobs FOR SELECT USING (((profile_id)::text = public.current_device_id()));


--
-- Name: current_jobs current_jobs: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "current_jobs: update own" ON public.current_jobs FOR UPDATE USING (((profile_id)::text = public.current_device_id()));


--
-- Name: past_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.past_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: past_jobs past_jobs: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "past_jobs: delete own" ON public.past_jobs FOR DELETE USING (((profile_id)::text = public.current_device_id()));


--
-- Name: past_jobs past_jobs: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "past_jobs: insert own" ON public.past_jobs FOR INSERT WITH CHECK (((profile_id)::text = public.current_device_id()));


--
-- Name: past_jobs past_jobs: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "past_jobs: read own" ON public.past_jobs FOR SELECT USING (((profile_id)::text = public.current_device_id()));


--
-- Name: past_jobs past_jobs: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "past_jobs: update own" ON public.past_jobs FOR UPDATE USING (((profile_id)::text = public.current_device_id()));


--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: posts posts: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: delete own" ON public.posts FOR DELETE USING (((user_id)::text = public.current_device_id()));


--
-- Name: posts posts: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: insert own" ON public.posts FOR INSERT WITH CHECK (((user_id)::text = public.current_device_id()));


--
-- Name: posts posts: read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: read all" ON public.posts FOR SELECT USING (true);


--
-- Name: posts posts: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: update own" ON public.posts FOR UPDATE USING (((user_id)::text = public.current_device_id()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: insert own" ON public.profiles FOR INSERT WITH CHECK (((id)::text = public.current_device_id()));


--
-- Name: profiles profiles: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: read own" ON public.profiles FOR SELECT USING (((id)::text = public.current_device_id()));


--
-- Name: profiles profiles: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: update own" ON public.profiles FOR UPDATE USING (((id)::text = public.current_device_id()));


--
-- Name: role_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: role_votes role_votes: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_votes: delete own" ON public.role_votes FOR DELETE USING (((user_id)::text = public.current_device_id()));


--
-- Name: role_votes role_votes: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_votes: insert own" ON public.role_votes FOR INSERT WITH CHECK (((user_id)::text = public.current_device_id()));


--
-- Name: role_votes role_votes: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_votes: read own" ON public.role_votes FOR SELECT USING (((user_id)::text = public.current_device_id()));


--
-- Name: role_votes role_votes: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_votes: update own" ON public.role_votes FOR UPDATE USING (((user_id)::text = public.current_device_id()));


--
-- Name: votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

--
-- Name: votes votes: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "votes: delete own" ON public.votes FOR DELETE USING (((user_id)::text = public.current_device_id()));


--
-- Name: votes votes: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "votes: insert own" ON public.votes FOR INSERT WITH CHECK (((user_id)::text = public.current_device_id()));


--
-- Name: votes votes: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "votes: read own" ON public.votes FOR SELECT USING (((user_id)::text = public.current_device_id()));


--
-- Name: votes votes: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "votes: update own" ON public.votes FOR UPDATE USING (((user_id)::text = public.current_device_id()));


--
-- PostgreSQL database dump complete
--



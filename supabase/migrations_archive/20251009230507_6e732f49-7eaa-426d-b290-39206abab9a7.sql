-- Remove salary column from businesses table
ALTER TABLE public.businesses DROP COLUMN IF EXISTS salary;
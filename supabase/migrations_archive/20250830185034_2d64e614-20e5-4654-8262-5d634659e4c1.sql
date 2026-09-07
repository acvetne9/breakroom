-- Remove place_id and url columns from businesses table
ALTER TABLE public.businesses 
DROP COLUMN place_id,
DROP COLUMN url;
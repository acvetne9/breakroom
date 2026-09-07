-- Clean up orphaned posts (posts referencing non-existent businesses)
DELETE FROM public.posts 
WHERE business_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = posts.business_id
  );

-- Add foreign key constraint to enable PostgREST joins
ALTER TABLE public.posts 
ADD CONSTRAINT posts_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE SET NULL;
-- Enable Row Level Security on businesses table (CRITICAL FIX)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for businesses table
-- Allow anyone to view businesses (maintaining current functionality)
CREATE POLICY "Anyone can view businesses" 
ON public.businesses 
FOR SELECT 
USING (true);

-- Only authenticated users can create businesses
CREATE POLICY "Authenticated users can create businesses" 
ON public.businesses 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Only authenticated users can update businesses
CREATE POLICY "Authenticated users can update businesses" 
ON public.businesses 
FOR UPDATE 
TO authenticated
USING (true);

-- Only authenticated users can delete businesses
CREATE POLICY "Authenticated users can delete businesses" 
ON public.businesses 
FOR DELETE 
TO authenticated
USING (true);

-- Add missing RLS policies for business_roles table
-- Allow authenticated users to insert business roles
CREATE POLICY "Authenticated users can create business roles" 
ON public.business_roles 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update business roles
CREATE POLICY "Authenticated users can update business roles" 
ON public.business_roles 
FOR UPDATE 
TO authenticated
USING (true);

-- Allow authenticated users to delete business roles
CREATE POLICY "Authenticated users can delete business roles" 
ON public.business_roles 
FOR DELETE 
TO authenticated
USING (true);
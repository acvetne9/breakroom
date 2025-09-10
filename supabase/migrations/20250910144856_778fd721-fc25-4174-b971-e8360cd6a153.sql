-- Enable RLS on geography_columns table
ALTER TABLE public.geography_columns ENABLE ROW LEVEL SECURITY;

-- Enable RLS on geometry_columns table  
ALTER TABLE public.geometry_columns ENABLE ROW LEVEL SECURITY;

-- Enable RLS on spatial_ref_sys table
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- Add basic read-only policies for PostGIS system tables
CREATE POLICY "Allow read access to geography_columns" 
ON public.geography_columns 
FOR SELECT 
USING (true);

CREATE POLICY "Allow read access to geometry_columns" 
ON public.geometry_columns 
FOR SELECT 
USING (true);

CREATE POLICY "Allow read access to spatial_ref_sys" 
ON public.spatial_ref_sys 
FOR SELECT 
USING (true);
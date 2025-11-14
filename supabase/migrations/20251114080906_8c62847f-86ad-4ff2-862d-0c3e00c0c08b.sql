-- Create global product mappings table (no user_id)
CREATE TABLE public.global_product_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_name text NOT NULL,
  mapped_name text NOT NULL,
  category text,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.global_product_mappings ENABLE ROW LEVEL SECURITY;

-- Everyone can read global mappings
CREATE POLICY "Anyone can view global mappings"
ON public.global_product_mappings
FOR SELECT
USING (true);

-- Only authenticated users can suggest new global mappings
CREATE POLICY "Authenticated users can insert global mappings"
ON public.global_product_mappings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_global_product_mappings_updated_at
BEFORE UPDATE ON public.global_product_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_global_product_mappings_original ON public.global_product_mappings(original_name);
CREATE INDEX idx_global_product_mappings_mapped ON public.global_product_mappings(mapped_name);
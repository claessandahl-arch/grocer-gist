-- Add auto_mapped column to product_mappings table
-- This tracks whether a mapping was created automatically by AI

ALTER TABLE public.product_mappings
ADD COLUMN IF NOT EXISTS auto_mapped boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.product_mappings.auto_mapped IS 'True if this mapping was automatically created by AI, false if manually created by user';

-- Add category column to product_mappings table
ALTER TABLE public.product_mappings
ADD COLUMN category text;

-- Add comment explaining the column
COMMENT ON COLUMN public.product_mappings.category IS 'Category for the mapped product (e.g., drycker, frukt_gront, etc.)';
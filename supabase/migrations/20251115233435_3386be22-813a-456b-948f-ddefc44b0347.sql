-- Update RLS policy for global_product_mappings to allow category updates
-- Drop the existing restrictive update policy
DROP POLICY IF EXISTS "Authenticated users can update global mappings" ON public.global_product_mappings;

-- Create a new policy that allows authenticated users to update categories
CREATE POLICY "Authenticated users can update global mapping categories"
ON public.global_product_mappings
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
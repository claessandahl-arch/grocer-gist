-- Add UPDATE policy for global_product_mappings (idempotent)
DROP POLICY IF EXISTS "Authenticated users can update global mappings" ON public.global_product_mappings;
CREATE POLICY "Authenticated users can update global mappings"
ON public.global_product_mappings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Add DELETE policy for global_product_mappings (for future functionality)
DROP POLICY IF EXISTS "Authenticated users can delete global mappings" ON public.global_product_mappings;
CREATE POLICY "Authenticated users can delete global mappings"
ON public.global_product_mappings
FOR DELETE
TO authenticated
USING (true);
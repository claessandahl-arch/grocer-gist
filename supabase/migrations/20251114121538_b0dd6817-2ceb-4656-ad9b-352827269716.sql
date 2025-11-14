-- Drop existing RLS policies that require authentication
DROP POLICY IF EXISTS "Users can view their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can create their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can update their own receipts" ON public.receipts;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON public.receipts;

DROP POLICY IF EXISTS "Users can view their own mappings" ON public.product_mappings;
DROP POLICY IF EXISTS "Users can create their own mappings" ON public.product_mappings;
DROP POLICY IF EXISTS "Users can update their own mappings" ON public.product_mappings;
DROP POLICY IF EXISTS "Users can delete their own mappings" ON public.product_mappings;

DROP POLICY IF EXISTS "Users can view their own corrections" ON public.receipt_corrections;
DROP POLICY IF EXISTS "Users can create their own corrections" ON public.receipt_corrections;
DROP POLICY IF EXISTS "Users can update their own corrections" ON public.receipt_corrections;
DROP POLICY IF EXISTS "Users can delete their own corrections" ON public.receipt_corrections;

-- Create new public access policies
CREATE POLICY "Anyone can view receipts" ON public.receipts FOR SELECT USING (true);
CREATE POLICY "Anyone can create receipts" ON public.receipts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update receipts" ON public.receipts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete receipts" ON public.receipts FOR DELETE USING (true);

CREATE POLICY "Anyone can view mappings" ON public.product_mappings FOR SELECT USING (true);
CREATE POLICY "Anyone can create mappings" ON public.product_mappings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update mappings" ON public.product_mappings FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete mappings" ON public.product_mappings FOR DELETE USING (true);

CREATE POLICY "Anyone can view corrections" ON public.receipt_corrections FOR SELECT USING (true);
CREATE POLICY "Anyone can create corrections" ON public.receipt_corrections FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update corrections" ON public.receipt_corrections FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete corrections" ON public.receipt_corrections FOR DELETE USING (true);
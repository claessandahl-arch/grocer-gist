-- =================================================================
-- Cleanup orphaned global product mappings with empty mapped_name
-- =================================================================
-- This migration fixes the issue where ProductManagement shows
-- ungrouped products even after all receipts are deleted.
--
-- Root cause: global_product_mappings table has entries with
-- empty/null mapped_name values that shouldn't exist.
-- =================================================================

-- Delete global mappings with empty or null mapped_name
DELETE FROM public.global_product_mappings
WHERE mapped_name IS NULL
   OR mapped_name = ''
   OR TRIM(mapped_name) = '';

-- Log the result
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM public.global_product_mappings;
  RAISE NOTICE 'Cleanup complete. Remaining global mappings: %', remaining_count;
END $$;

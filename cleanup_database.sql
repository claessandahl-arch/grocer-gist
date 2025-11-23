-- =================================================================
-- COMPLETE DATABASE CLEANUP SCRIPT
-- =================================================================
-- Purpose: Reset database to 100% clean state
-- Use case: After manually deleting receipts, orphaned products remain
--
-- WARNING: This will permanently delete ALL user data. Cannot be undone.
-- Make sure you have a backup if needed.
-- =================================================================

-- Print current state before cleanup
SELECT
  'BEFORE CLEANUP' as status,
  (SELECT COUNT(*) FROM public.receipts) as receipts,
  (SELECT COUNT(*) FROM public.product_mappings) as user_mappings,
  (SELECT COUNT(*) FROM public.global_product_mappings) as global_mappings,
  (SELECT COUNT(*) FROM public.global_product_mappings WHERE mapped_name IS NULL OR mapped_name = '') as global_empty;

-- =================================================================
-- STEP 1: Delete all user-specific data
-- =================================================================

-- Delete all receipts
DELETE FROM public.receipts;

-- Delete all user product mappings
DELETE FROM public.product_mappings;

-- Delete all receipt corrections (training data)
DELETE FROM public.receipt_corrections;

-- Delete all ignored merge suggestions
DELETE FROM public.ignored_merge_suggestions;

-- Delete all category suggestion feedback
DELETE FROM public.category_suggestion_feedback;

-- Delete all user global overrides
DELETE FROM public.user_global_overrides;

-- Delete all store patterns (learned AI patterns)
DELETE FROM public.store_patterns;

-- Delete all global mapping change audit logs
DELETE FROM public.global_mapping_changes;

-- =================================================================
-- STEP 2: Clean up global_product_mappings with empty/null names
-- =================================================================

-- Delete global mappings with empty or null mapped_name
-- These cause "ungrouped products" to appear even with no receipts
DELETE FROM public.global_product_mappings
WHERE mapped_name IS NULL OR mapped_name = '' OR TRIM(mapped_name) = '';

-- =================================================================
-- STEP 3 (OPTIONAL): Reset global mappings completely
-- =================================================================

-- Uncomment these lines if you want to remove ALL global mappings
-- and start completely fresh (no seeded products)

-- DELETE FROM public.global_product_mappings;

-- To restore the seed data after deleting, you would need to re-run:
-- supabase/migrations/20251115000000_seed_global_product_mappings.sql

-- =================================================================
-- VERIFICATION: Check final state
-- =================================================================

SELECT
  'AFTER CLEANUP' as status,
  (SELECT COUNT(*) FROM public.receipts) as receipts,
  (SELECT COUNT(*) FROM public.product_mappings) as user_mappings,
  (SELECT COUNT(*) FROM public.receipt_corrections) as corrections,
  (SELECT COUNT(*) FROM public.global_product_mappings) as global_mappings,
  (SELECT COUNT(*) FROM public.global_product_mappings WHERE mapped_name IS NULL OR mapped_name = '') as global_empty,
  (SELECT COUNT(*) FROM public.ignored_merge_suggestions) as ignored_suggestions,
  (SELECT COUNT(*) FROM public.category_suggestion_feedback) as feedback,
  (SELECT COUNT(*) FROM public.store_patterns) as store_patterns;

-- Expected results for 100% clean state:
-- receipts: 0
-- user_mappings: 0
-- corrections: 0
-- global_mappings: ~110 (if you kept seeded data) or 0 (if you deleted all)
-- global_empty: 0 (should be 0 regardless)
-- ignored_suggestions: 0
-- feedback: 0
-- store_patterns: 0

-- =================================================================
-- DEBUG: Show remaining global mappings (if any)
-- =================================================================

SELECT
  id,
  original_name,
  mapped_name,
  category,
  usage_count,
  created_at
FROM public.global_product_mappings
ORDER BY mapped_name, original_name
LIMIT 20;

-- =================================================================
-- NOTES
-- =================================================================

-- Q: Why do products remain after deleting receipts?
-- A: Receipt items are stored as JSONB in the receipts.items column.
--    Product mappings (both user and global) are separate tables.
--    There is NO foreign key cascade relationship.
--    Deleting receipts does NOT automatically delete mappings.

-- Q: Is this a bug?
-- A: No, it's by design. Mappings persist so users don't lose their
--    grouping work when they delete old receipts. However, orphaned
--    mappings (especially global ones with empty names) can cause
--    confusion.

-- Q: How to prevent this in the future?
-- A:
--    1. Use the /diagnostics page "Rensa tomma kopplingar" button
--    2. Ensure global mappings never have empty mapped_name values
--    3. Consider adding a "last_used_at" column to track usage
--    4. Add validation in the UI to prevent empty names

-- Q: What if I want to keep some global mappings?
-- A: Don't run STEP 3. The seeded global mappings are useful for
--    future receipts. Just clean up the empty ones with STEP 2.

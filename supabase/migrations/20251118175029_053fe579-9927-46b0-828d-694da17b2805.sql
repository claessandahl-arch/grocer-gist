-- Step 1: Remove duplicate entries, keeping only the most recent one for each user_id + original_name
DELETE FROM product_mappings a
USING product_mappings b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.original_name = b.original_name;

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE product_mappings 
ADD CONSTRAINT product_mappings_user_id_original_name_key 
UNIQUE (user_id, original_name);
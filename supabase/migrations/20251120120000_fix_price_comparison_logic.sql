-- Migration: Fix Price Comparison Logic
-- Description: Updates extract_unit_info regex and view_price_comparison logic.

-- 1. Update extract_unit_info with improved regex and normalization
CREATE OR REPLACE FUNCTION public.extract_unit_info(product_name TEXT)
RETURNS TABLE (amount DECIMAL, unit TEXT) AS $$
DECLARE
    normalized_amount DECIMAL;
    normalized_unit TEXT;
    matches TEXT[];
BEGIN
    -- Improved Regex:
    -- 1. Handles optional spaces between number and unit (\s*)
    -- 2. Handles comma or dot for decimal ([.,]?)
    -- 3. Case insensitive (LOWER used in call)
    -- 4. Matches unit at end of string or followed by space/end
    matches := regexp_matches(
        LOWER(product_name), 
        '(\d+[.,]?\d*)\s*(kg|hg|g|l|dl|cl|ml|st|pack|p)(?:\s|$)', 
        'i'
    );

    IF matches IS NOT NULL THEN
        -- Parse amount (replace comma with dot)
        normalized_amount := CAST(REPLACE(matches[1], ',', '.') AS DECIMAL);
        normalized_unit := matches[2];

        -- Normalize Units
        CASE normalized_unit
            -- Mass -> kg
            WHEN 'g' THEN
                normalized_amount := normalized_amount / 1000.0;
                normalized_unit := 'kg';
            WHEN 'hg' THEN
                normalized_amount := normalized_amount / 10.0;
                normalized_unit := 'kg';
            
            -- Volume -> l
            WHEN 'ml' THEN
                normalized_amount := normalized_amount / 1000.0;
                normalized_unit := 'l';
            WHEN 'cl' THEN
                normalized_amount := normalized_amount / 100.0;
                normalized_unit := 'l';
            WHEN 'dl' THEN
                normalized_amount := normalized_amount / 10.0;
                normalized_unit := 'l';
            
            -- Count -> st
            WHEN 'pack' THEN
                normalized_unit := 'st';
            WHEN 'p' THEN
                normalized_unit := 'st';
            
            ELSE
                -- Keep as is (kg, l, st)
        END CASE;

        RETURN QUERY SELECT normalized_amount, normalized_unit;
    ELSE
        RETURN QUERY SELECT NULL::DECIMAL, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Re-run backfill to apply new regex to existing data
WITH unit_info AS (
    SELECT id, (public.extract_unit_info(original_name)).*
    FROM public.product_mappings
    WHERE quantity_amount IS NULL OR quantity_unit IS NULL
)
UPDATE public.product_mappings pm
SET 
    quantity_amount = ui.amount,
    quantity_unit = ui.unit
FROM unit_info ui
WHERE pm.id = ui.id;

WITH unit_info AS (
    SELECT id, (public.extract_unit_info(original_name)).*
    FROM public.global_product_mappings
    WHERE quantity_amount IS NULL OR quantity_unit IS NULL
)
UPDATE public.global_product_mappings gpm
SET 
    quantity_amount = ui.amount,
    quantity_unit = ui.unit
FROM unit_info ui
WHERE gpm.id = ui.id;


-- 3. Update View to exclude Pant and filter outliers
CREATE OR REPLACE VIEW public.view_price_comparison AS
WITH exploded_items AS (
    -- Extract individual items from receipts JSONB
    SELECT 
        r.id as receipt_id,
        r.store_name,
        r.receipt_date,
        item->>'name' as original_name,
        (item->>'price')::DECIMAL as price,
        COALESCE((item->>'quantity')::DECIMAL, 1) as quantity
    FROM 
        public.receipts r,
        jsonb_array_elements(r.items) as item
    WHERE 
        r.user_id IS NOT NULL 
        -- Filter out Pant/Deposit items
        AND LOWER(item->>'name') NOT LIKE '%pant%' 
        AND LOWER(item->>'name') NOT LIKE '%deposit%'
        -- Filter out very low price items (outliers/adjustments)
        AND (item->>'price')::DECIMAL > 5.00
),
mapped_items AS (
    -- Join with product_mappings to get mapped_name and unit info
    SELECT 
        ei.*,
        COALESCE(pm.mapped_name, ei.original_name) as mapped_name,
        pm.quantity_amount,
        pm.quantity_unit
    FROM 
        exploded_items ei
    LEFT JOIN 
        public.product_mappings pm ON ei.original_name = pm.original_name
    WHERE 
        pm.quantity_amount IS NOT NULL AND pm.quantity_amount > 0 
)
SELECT 
    mapped_name,
    quantity_unit,
    MIN(price / (quantity * quantity_amount)) as min_price_per_unit,
    AVG(price / (quantity * quantity_amount)) as avg_price_per_unit,
    MAX(price / (quantity * quantity_amount)) as max_price_per_unit,
    
    (SELECT store_name FROM mapped_items sub 
     WHERE sub.mapped_name = main.mapped_name 
       AND sub.quantity_unit = main.quantity_unit 
       AND (sub.price / (sub.quantity * sub.quantity_amount)) = MIN(main.price / (main.quantity * main.quantity_amount))
     LIMIT 1) as best_store_name,
     
    COUNT(*) as data_points
FROM 
    mapped_items main
GROUP BY 
    mapped_name, quantity_unit;

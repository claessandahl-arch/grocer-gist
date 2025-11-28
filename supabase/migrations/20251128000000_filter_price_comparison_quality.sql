-- Migration: Filter Price Comparison by Unit Quality
-- Description: Filters view_price_comparison to only show items with reliable unit information.
-- This prevents meaningless comparisons (e.g., 33cl vs 1.5L bottles both showing as "kr/st").
-- Requires minimum 2 purchases for meaningful price comparison.

DROP VIEW IF EXISTS public.view_price_comparison;

CREATE OR REPLACE VIEW public.view_price_comparison AS
WITH exploded_items AS (
    -- Extract individual items from receipts JSONB
    SELECT
        r.id as receipt_id,
        r.store_name,
        r.receipt_date,
        item->>'name' as original_name,
        (item->>'price')::DECIMAL as price,
        COALESCE((item->>'quantity')::DECIMAL, 1) as quantity,
        -- Extract new unit fields
        item->>'quantity_unit' as receipt_quantity_unit,
        (item->>'content_amount')::DECIMAL as receipt_content_amount,
        item->>'content_unit' as receipt_content_unit
    FROM
        public.receipts r,
        jsonb_array_elements(r.items) as item
    WHERE
        r.user_id = auth.uid() -- RESTRICT TO AUTHENTICATED USER
        -- Filter out Pant/Deposit items
        AND LOWER(item->>'name') NOT LIKE '%pant%'
        AND LOWER(item->>'name') NOT LIKE '%deposit%'
        -- Filter out very low price items (outliers/adjustments)
        AND (item->>'price')::DECIMAL > 5.00
),
mapped_items AS (
    -- Join with product_mappings to get mapped_name and unit info
    -- NEW: Only include items with reliable unit information
    SELECT
        ei.*,
        COALESCE(pm.mapped_name, ei.original_name) as mapped_name,

        -- Calculate effective amount per item (e.g., 0.5 for 500g coffee)
        -- Priority:
        -- 1. Receipt content amount (AI extracted "500g")
        -- 2. Product mapping amount (User defined "0.5 kg")
        -- 3. Default to 1
        COALESCE(ei.receipt_content_amount, pm.quantity_amount, 1) as effective_amount,

        -- Determine effective unit
        -- Priority:
        -- 1. Receipt content unit (AI extracted "kg" from "500g")
        -- 2. Receipt quantity unit (AI extracted "kg" from "1.5 kg apples")
        -- 3. Product mapping unit (User defined "kg")
        -- 4. Default to 'st'
        COALESCE(ei.receipt_content_unit, ei.receipt_quantity_unit, pm.quantity_unit, 'st') as effective_unit
    FROM
        exploded_items ei
    LEFT JOIN
        public.product_mappings pm ON ei.original_name = pm.original_name

    -- NEW: Filter to only include items with reliable unit information
    WHERE
        -- Has explicit content amount from receipt (e.g., "Coca-Cola 33cl" → 0.33L)
        (ei.receipt_content_amount IS NOT NULL AND ei.receipt_content_amount > 0)
        OR
        -- Has user mapping with quantity info (manually mapped product)
        (pm.quantity_amount IS NOT NULL AND pm.quantity_amount > 0)
        OR
        -- Is a weighted item sold by kg/L (fruits, vegetables, liquids by weight)
        (ei.receipt_quantity_unit IN ('kg', 'g', 'l', 'ml', 'cl', 'dl'))
)
SELECT
    mapped_name,
    effective_unit as quantity_unit,

    -- Calculate price per unit
    -- Formula: Price / (Quantity * Amount_Per_Item)
    MIN(price / (quantity * effective_amount)) as min_price_per_unit,
    AVG(price / (quantity * effective_amount)) as avg_price_per_unit,
    MAX(price / (quantity * effective_amount)) as max_price_per_unit,

    -- Find best store
    (SELECT store_name FROM mapped_items sub
     WHERE sub.mapped_name = main.mapped_name
       AND sub.effective_unit = main.effective_unit
       AND (sub.price / (sub.quantity * sub.effective_amount)) = MIN(main.price / (main.quantity * main.effective_amount))
     LIMIT 1) as best_store_name,

    COUNT(*) as data_points
FROM
    mapped_items main
GROUP BY
    mapped_name, effective_unit
-- NEW: Require minimum 2 purchases for meaningful comparison
HAVING COUNT(*) >= 2;

-- Grant access to the view
GRANT SELECT ON public.view_price_comparison TO authenticated;
GRANT SELECT ON public.view_price_comparison TO service_role;

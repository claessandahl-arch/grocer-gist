-- Migration: Personalize Price Comparison View
-- Description: Restricts the view_price_comparison to only show data from the authenticated user's receipts.

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
        r.user_id = auth.uid() -- RESTRICT TO AUTHENTICATED USER
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

-- Grant access to the view
GRANT SELECT ON public.view_price_comparison TO authenticated;
GRANT SELECT ON public.view_price_comparison TO service_role;

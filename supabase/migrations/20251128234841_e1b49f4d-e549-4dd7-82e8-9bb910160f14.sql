-- CRITICAL FIX: Price comparison view leaking other users' data
-- The previous view was not properly filtering by user_id in all scenarios

DROP VIEW IF EXISTS public.view_price_comparison;

CREATE OR REPLACE VIEW public.view_price_comparison AS
WITH exploded_items AS (
    SELECT
        r.id as receipt_id,
        r.user_id, -- CRITICAL: Keep user_id for filtering
        r.store_name,
        r.receipt_date,
        item->>'name' as original_name,
        (item->>'price')::DECIMAL as price,
        COALESCE((item->>'quantity')::DECIMAL, 1) as quantity,
        item->>'quantity_unit' as receipt_quantity_unit,
        (item->>'content_amount')::DECIMAL as receipt_content_amount,
        item->>'content_unit' as receipt_content_unit
    FROM
        public.receipts r,
        jsonb_array_elements(r.items) as item
    WHERE
        r.user_id = auth.uid() -- Filter receipts by current user
        AND LOWER(item->>'name') NOT LIKE '%pant%'
        AND LOWER(item->>'name') NOT LIKE '%deposit%'
        AND (item->>'price')::DECIMAL > 5.00
),
mapped_items AS (
    SELECT
        ei.*,
        COALESCE(pm.mapped_name, ei.original_name) as mapped_name,
        COALESCE(ei.receipt_content_amount, pm.quantity_amount, 1) as effective_amount,
        COALESCE(ei.receipt_content_unit, ei.receipt_quantity_unit, pm.quantity_unit, 'st') as effective_unit
    FROM
        exploded_items ei
    LEFT JOIN
        public.product_mappings pm 
        ON ei.original_name = pm.original_name 
        AND pm.user_id = ei.user_id -- CRITICAL FIX: Only join user's own mappings
    WHERE
        (ei.receipt_content_amount IS NOT NULL AND ei.receipt_content_amount > 0)
        OR (pm.quantity_amount IS NOT NULL AND pm.quantity_amount > 0)
        OR (ei.receipt_quantity_unit IN ('kg', 'g', 'l', 'ml', 'cl', 'dl'))
)
SELECT
    mapped_name,
    effective_unit as quantity_unit,
    MIN(price / (quantity * effective_amount)) as min_price_per_unit,
    AVG(price / (quantity * effective_amount)) as avg_price_per_unit,
    MAX(price / (quantity * effective_amount)) as max_price_per_unit,
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
HAVING COUNT(*) >= 2;

GRANT SELECT ON public.view_price_comparison TO authenticated;
GRANT SELECT ON public.view_price_comparison TO service_role;
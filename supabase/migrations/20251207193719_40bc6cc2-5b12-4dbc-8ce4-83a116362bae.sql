-- Migration: Fix Price History RPC Filters
-- Description: Adds missing filters to get_product_price_history to prevent casting errors on invalid/excluded items (e.g. Pant, missing prices).
-- This mirrors the logic in view_price_comparison.

CREATE OR REPLACE FUNCTION public.get_product_price_history(
    target_mapped_name TEXT,
    target_unit TEXT
)
RETURNS SETOF price_history_item
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH exploded_items_with_index AS (
        SELECT 
            r.id as receipt_id,
            r.store_name,
            r.receipt_date,
            item->>'name' as original_name,
            (item->>'price')::DECIMAL as price,
            COALESCE((item->>'quantity')::DECIMAL, 1) as quantity,
            item->>'quantity_unit' as receipt_quantity_unit,
            (item->>'content_amount')::DECIMAL as receipt_content_amount,
            item->>'content_unit' as receipt_content_unit,
            COALESCE((item->>'ignored')::BOOLEAN, false) as is_ignored,
            idx - 1 as item_index
        FROM 
            public.receipts r,
            jsonb_array_elements(r.items) WITH ORDINALITY arr(item, idx)
        WHERE 
            r.user_id = auth.uid()
            -- Add same filters as the View to avoid crashing on invalid data
            AND LOWER(item->>'name') NOT LIKE '%pant%' 
            AND LOWER(item->>'name') NOT LIKE '%deposit%'
            -- Ensure price is valid number and > 5.00
            AND (item->>'price') ~ '^\d+(\.\d+)?$'
            AND (item->>'price')::DECIMAL > 5.00
    ),
    mapped_items AS (
        SELECT 
            ei.*,
            COALESCE(pm.mapped_name, ei.original_name) as mapped_name,
            COALESCE(ei.receipt_content_amount, pm.quantity_amount, 1) as effective_amount,
            COALESCE(ei.receipt_content_unit, ei.receipt_quantity_unit, pm.quantity_unit, 'st') as effective_unit
        FROM 
            exploded_items_with_index ei
        LEFT JOIN 
            public.product_mappings pm ON ei.original_name = pm.original_name
    )
    SELECT 
        receipt_id,
        receipt_date,
        store_name,
        original_name,
        price,
        quantity,
        effective_amount,
        (price / (quantity * effective_amount))::DECIMAL as unit_price,
        is_ignored,
        item_index::INTEGER
    FROM 
        mapped_items
    WHERE 
        mapped_name = target_mapped_name 
        AND effective_unit = target_unit
    ORDER BY 
        receipt_date DESC;
END;
$$;
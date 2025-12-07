-- Migration: Price History and Ignore Capability
-- Description: 
-- 1. Updates view_price_comparison to respect an 'ignored' flag in receipt items.
-- 2. Adds RPC function to fetch detailed history for a product.
-- 3. Adds RPC function to toggle the 'ignored' flag for a specific item.

-- 1. Update view_price_comparison to filter out ignored items
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
        item->>'content_unit' as receipt_content_unit,
        -- Check for ignored flag
        COALESCE((item->>'ignored')::BOOLEAN, false) as is_ignored
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
        
        -- Calculate effective amount per item
        COALESCE(ei.receipt_content_amount, pm.quantity_amount, 1) as effective_amount,
        
        -- Determine effective unit
        COALESCE(ei.receipt_content_unit, ei.receipt_quantity_unit, pm.quantity_unit, 'st') as effective_unit
    FROM 
        exploded_items ei
    LEFT JOIN 
        public.product_mappings pm ON ei.original_name = pm.original_name
    WHERE
        ei.is_ignored = false -- IMPORTANT: Exclude ignored items
)
SELECT 
    mapped_name,
    effective_unit as quantity_unit,
    
    -- Calculate price per unit
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
    mapped_name, effective_unit;

-- Grant access to the view
GRANT SELECT ON public.view_price_comparison TO authenticated;
GRANT SELECT ON public.view_price_comparison TO service_role;


-- 2. Helper Type for History Response
DROP TYPE IF EXISTS price_history_item CASCADE;
CREATE TYPE price_history_item AS (
  receipt_id UUID,
  receipt_date DATE,
  store_name TEXT,
  original_name TEXT,
  price DECIMAL,
  quantity DECIMAL,
  effective_amount DECIMAL,
  unit_price DECIMAL,
  is_ignored BOOLEAN,
  item_index INTEGER -- Need index to update the specific item in the JSON array
);


-- 3. RPC to fetch history
CREATE OR REPLACE FUNCTION get_product_price_history(
    target_mapped_name TEXT,
    target_unit TEXT
)
RETURNS SETOF price_history_item AS $$
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
            idx - 1 as item_index -- adjusting 1-based index to 0-based for JS manipulation if needed
        FROM 
            public.receipts r,
            jsonb_array_elements(r.items) WITH ORDINALITY arr(item, idx)
        WHERE 
            r.user_id = auth.uid()
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC to toggle ignore status
-- Note: This is tricky with JSONB arrays. usage: modify specific index.
CREATE OR REPLACE FUNCTION toggle_receipt_item_ignore(
    target_receipt_id UUID,
    target_item_index INTEGER,
    set_ignored BOOLEAN
)
RETURNS VOID AS $$
DECLARE
    current_items JSONB;
    new_items JSONB;
BEGIN
    -- Get current items
    SELECT items INTO current_items FROM public.receipts WHERE id = target_receipt_id AND user_id = auth.uid();
    
    IF current_items IS NULL THEN
        RAISE EXCEPTION 'Receipt not found or access denied';
    END IF;

    -- Update the specific item at index
    -- We use jsonb_set but since we modify an object inside an array, we need a path like '{index, ignored}'
    -- HOWEVER, simpler approach in Postgres for array element update might be needed.
    
    SELECT jsonb_set(
        current_items, 
        ARRAY[target_item_index::text, 'ignored'], 
        to_jsonb(set_ignored)
    ) INTO new_items;

    -- Update the table
    UPDATE public.receipts 
    SET items = new_items 
    WHERE id = target_receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

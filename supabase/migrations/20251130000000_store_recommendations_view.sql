-- Store Recommendations View
-- Analyzes user's purchase history to recommend optimal store choices
-- Identifies potential savings by comparing prices across stores

-- Step 1: Create view for user's "usual basket" (products bought 3+ times)
CREATE OR REPLACE VIEW public.view_user_basket AS
WITH user_purchases AS (
    SELECT
        r.user_id,
        r.store_name,
        item->>'name' as original_name,
        COALESCE(pm.mapped_name, item->>'name') as product_name,
        (item->>'price')::DECIMAL as price,
        COALESCE((item->>'quantity')::DECIMAL, 1) as quantity,
        r.receipt_date
    FROM
        public.receipts r
    CROSS JOIN LATERAL jsonb_array_elements(r.items) as item
    LEFT JOIN
        public.product_mappings pm ON (item->>'name') = pm.original_name AND pm.user_id = r.user_id
    WHERE
        r.user_id = auth.uid()
        AND (item->>'price')::DECIMAL > 0
        AND LOWER(item->>'name') NOT LIKE '%pant%'
)
SELECT
    user_id,
    product_name,
    COUNT(*) as purchase_count,
    COUNT(DISTINCT store_name) as stores_bought_at,
    AVG(price / quantity) as avg_unit_price,
    SUM(price) as total_spent
FROM user_purchases
GROUP BY user_id, product_name
HAVING COUNT(*) >= 3;

GRANT SELECT ON public.view_user_basket TO authenticated;
GRANT SELECT ON public.view_user_basket TO service_role;

-- Step 2: Create view for price by store per product
CREATE OR REPLACE VIEW public.view_product_store_prices AS
WITH product_prices AS (
    SELECT
        r.user_id,
        r.store_name,
        COALESCE(pm.mapped_name, item->>'name') as product_name,
        (item->>'price')::DECIMAL as price,
        COALESCE((item->>'quantity')::DECIMAL, 1) as quantity,
        r.receipt_date
    FROM
        public.receipts r
    CROSS JOIN LATERAL jsonb_array_elements(r.items) as item
    LEFT JOIN
        public.product_mappings pm ON (item->>'name') = pm.original_name AND pm.user_id = r.user_id
    WHERE
        r.user_id = auth.uid()
        AND (item->>'price')::DECIMAL > 0
        AND LOWER(item->>'name') NOT LIKE '%pant%'
)
SELECT
    user_id,
    product_name,
    store_name,
    AVG(price / quantity) as avg_unit_price,
    MIN(price / quantity) as min_unit_price,
    MAX(price / quantity) as max_unit_price,
    COUNT(*) as data_points,
    MAX(receipt_date) as last_purchased
FROM product_prices
GROUP BY user_id, product_name, store_name;

GRANT SELECT ON public.view_product_store_prices TO authenticated;
GRANT SELECT ON public.view_product_store_prices TO service_role;

-- Step 3: Main recommendations view - identifies savings opportunities
CREATE OR REPLACE VIEW public.view_store_recommendations AS
WITH 
-- Get user's usual products (bought 3+ times)
usual_products AS (
    SELECT * FROM public.view_user_basket
),
-- Get all price data per store
store_prices AS (
    SELECT * FROM public.view_product_store_prices
),
-- Find cheapest store for each product
cheapest_store AS (
    SELECT DISTINCT ON (user_id, product_name)
        user_id,
        product_name,
        store_name as cheapest_store_name,
        avg_unit_price as cheapest_price
    FROM store_prices
    WHERE data_points >= 2  -- Need at least 2 purchases to trust the price
    ORDER BY user_id, product_name, avg_unit_price ASC
),
-- Calculate what user typically pays vs what they could pay
savings_analysis AS (
    SELECT
        up.user_id,
        up.product_name,
        up.purchase_count,
        up.avg_unit_price as current_avg_price,
        cs.cheapest_store_name,
        cs.cheapest_price,
        (up.avg_unit_price - cs.cheapest_price) as savings_per_unit,
        ((up.avg_unit_price - cs.cheapest_price) * up.purchase_count) as potential_total_savings
    FROM usual_products up
    LEFT JOIN cheapest_store cs ON up.user_id = cs.user_id AND up.product_name = cs.product_name
    WHERE cs.cheapest_price IS NOT NULL
      AND up.avg_unit_price > cs.cheapest_price  -- Only show if there's actual savings
)
SELECT
    user_id,
    product_name,
    purchase_count,
    ROUND(current_avg_price::numeric, 2) as current_avg_price,
    cheapest_store_name,
    ROUND(cheapest_price::numeric, 2) as cheapest_price,
    ROUND(savings_per_unit::numeric, 2) as savings_per_unit,
    ROUND(potential_total_savings::numeric, 2) as potential_total_savings,
    ROUND((savings_per_unit / current_avg_price * 100)::numeric, 1) as savings_percent
FROM savings_analysis
WHERE savings_per_unit > 0.5  -- Only show if savings > 0.50 kr
ORDER BY potential_total_savings DESC;

GRANT SELECT ON public.view_store_recommendations TO authenticated;
GRANT SELECT ON public.view_store_recommendations TO service_role;

-- Step 4: Summary view - aggregate savings by store
CREATE OR REPLACE VIEW public.view_store_savings_summary AS
SELECT
    user_id,
    cheapest_store_name as store_name,
    COUNT(*) as products_cheapest_at,
    SUM(potential_total_savings) as total_potential_savings,
    AVG(savings_percent) as avg_savings_percent
FROM public.view_store_recommendations
WHERE user_id = auth.uid()
GROUP BY user_id, cheapest_store_name
ORDER BY total_potential_savings DESC;

GRANT SELECT ON public.view_store_savings_summary TO authenticated;
GRANT SELECT ON public.view_store_savings_summary TO service_role;

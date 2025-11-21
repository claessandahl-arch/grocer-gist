-- View for Monthly Stats (Total Spend, Receipt Count, Avg per Receipt)
CREATE OR REPLACE VIEW public.view_monthly_stats AS
SELECT
    user_id,
    date_trunc('month', receipt_date)::date AS month_start,
    SUM(total_amount) AS total_spend,
    COUNT(*) AS receipt_count,
    CASE
        WHEN COUNT(*) > 0 THEN SUM(total_amount) / COUNT(*)
        ELSE 0
    END AS avg_per_receipt
FROM
    public.receipts
WHERE
    receipt_date IS NOT NULL
GROUP BY
    user_id,
    date_trunc('month', receipt_date);

-- View for Category Breakdown (Spend by Category per Month)
CREATE OR REPLACE VIEW public.view_category_breakdown AS
WITH receipt_items AS (
    SELECT
        r.user_id,
        date_trunc('month', r.receipt_date)::date AS month_start,
        item ->> 'category' AS original_category,
        (item ->> 'price')::numeric AS price,
        item ->> 'name' AS product_name
    FROM
        public.receipts r,
        jsonb_array_elements(r.items) AS item
    WHERE
        r.receipt_date IS NOT NULL
),
corrected_items AS (
    SELECT
        ri.user_id,
        ri.month_start,
        ri.price,
        COALESCE(
            pm.category, -- User mapping
            gpm.category, -- Global mapping
            ri.original_category, -- Original receipt category
            'other' -- Fallback
        ) AS final_category
    FROM
        receipt_items ri
    LEFT JOIN public.product_mappings pm ON ri.user_id = pm.user_id AND ri.product_name = pm.original_name
    LEFT JOIN public.global_product_mappings gpm ON ri.product_name = gpm.original_name
)
SELECT
    user_id,
    month_start,
    final_category AS category,
    SUM(price) AS total_spend
FROM
    corrected_items
GROUP BY
    user_id,
    month_start,
    final_category;

-- View for Store Comparison (Spend by Store per Month)
CREATE OR REPLACE VIEW public.view_store_comparison AS
SELECT
    user_id,
    date_trunc('month', receipt_date)::date AS month_start,
    store_name,
    SUM(total_amount) AS total_spend,
    COUNT(*) AS visit_count
FROM
    public.receipts
WHERE
    receipt_date IS NOT NULL
    AND store_name IS NOT NULL
GROUP BY
    user_id,
    date_trunc('month', receipt_date),
    store_name;
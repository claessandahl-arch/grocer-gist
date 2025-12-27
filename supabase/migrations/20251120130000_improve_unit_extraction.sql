-- Drop and recreate function with updated signature
DROP FUNCTION IF EXISTS public.extract_unit_info(TEXT);

-- Update the extraction function to be more aggressive/smart
CREATE OR REPLACE FUNCTION public.extract_unit_info(product_name TEXT)
RETURNS TABLE (quantity_amount DECIMAL, quantity_unit TEXT) AS $$
DECLARE
    normalized_name TEXT;
    match_text TEXT[];
BEGIN
    normalized_name := lower(product_name);

    -- 1. Explicit Quantity (e.g., "1.5kg", "500 g", "2.5 l", "10-pack")
    -- Added 'stk' and more flexible spacing
    SELECT regexp_matches(normalized_name, '(\d+[.,]?\d*)\s*(kg|hg|g|l|dl|cl|ml|st|pack|p|stk)(?:\s|$)', 'i') INTO match_text;

    IF match_text IS NOT NULL THEN
        quantity_amount := replace(match_text[1], ',', '.')::DECIMAL;
        quantity_unit := match_text[2];

        -- Normalize units
        CASE quantity_unit
            WHEN 'g' THEN quantity_amount := quantity_amount / 1000; quantity_unit := 'kg';
            WHEN 'hg' THEN quantity_amount := quantity_amount / 10; quantity_unit := 'kg';
            WHEN 'ml' THEN quantity_amount := quantity_amount / 1000; quantity_unit := 'l';
            WHEN 'cl' THEN quantity_amount := quantity_amount / 100; quantity_unit := 'l';
            WHEN 'dl' THEN quantity_amount := quantity_amount / 10; quantity_unit := 'l';
            WHEN 'pack' THEN quantity_unit := 'st';
            WHEN 'p' THEN quantity_unit := 'st';
            WHEN 'stk' THEN quantity_unit := 'st';
            ELSE -- kg, l, st are already correct
        END CASE;

        RETURN NEXT;
        RETURN;
    END IF;

    -- 2. Implicit "Piece" Units (e.g., "Blåbär ask", "Persilja kruka")
    -- These are items that are typically sold as "1 st" but denoted by their container/form
    IF normalized_name ~ '(ask|kruka|bunt|pkt|burk|nät|tråg|påse|tub|flaska)' THEN
        quantity_amount := 1;
        quantity_unit := 'st';
        RETURN NEXT;
        RETURN;
    END IF;

    -- 3. Fallback: Default to "1 st" for everything else
    -- This ensures that products like "Blandfärs" or "Gurka" (where no unit is specified)
    -- are treated as 1 unit/piece, allowing them to appear in price comparisons.
    -- We rely on the view to filter out non-products like "Pant".
    quantity_amount := 1;
    quantity_unit := 'st';
    RETURN NEXT;
    RETURN;

END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Re-run backfill for user mappings using CTE
WITH unit_info AS (
    SELECT id, (public.extract_unit_info(original_name)).*
    FROM public.product_mappings
)
UPDATE public.product_mappings pm
SET
  quantity_amount = ui.quantity_amount,
  quantity_unit = ui.quantity_unit
FROM unit_info ui
WHERE pm.id = ui.id;

-- Re-run backfill for global mappings using CTE
WITH unit_info AS (
    SELECT id, (public.extract_unit_info(original_name)).*
    FROM public.global_product_mappings
)
UPDATE public.global_product_mappings gpm
SET
  quantity_amount = ui.quantity_amount,
  quantity_unit = ui.quantity_unit
FROM unit_info ui
WHERE gpm.id = ui.id;


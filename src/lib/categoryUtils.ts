/**
 * Utility functions for category lookups and normalization
 */

type ProductMapping = {
  original_name: string;
  mapped_name: string;
  category: string | null;
};

type GlobalProductMapping = {
  original_name: string;
  mapped_name: string;
  category: string | null;
};

type ReceiptItem = {
  name: string;
  category?: string | null;
  price: number;
  quantity?: number;
  discount?: number;
};

/**
 * Get the correct category for a product item.
 * Priority:
 * 1. Category from user's product_mappings (corrected/standardized)
 * 2. Category from global_product_mappings
 * 3. Category from receipt item (AI-parsed)
 * 4. Default to 'other'
 *
 * @param itemName - The product name from the receipt
 * @param userMappings - User's product mappings
 * @param globalMappings - Global product mappings
 * @param receiptCategory - The category from the receipt (AI-parsed)
 * @returns The correct category to use
 */
export function getCategoryForItem(
  itemName: string,
  userMappings: ProductMapping[] | undefined,
  globalMappings: GlobalProductMapping[] | undefined,
  receiptCategory?: string | null
): string {
  // First, check user mappings (highest priority)
  const userMapping = userMappings?.find(
    m => m.original_name.toLowerCase() === itemName.toLowerCase()
  );
  if (userMapping?.category) {
    return userMapping.category;
  }

  // Second, check global mappings
  const globalMapping = globalMappings?.find(
    m => m.original_name.toLowerCase() === itemName.toLowerCase()
  );
  if (globalMapping?.category) {
    return globalMapping.category;
  }

  // Third, use receipt category (AI-parsed)
  if (receiptCategory) {
    return receiptCategory;
  }

  // Default fallback
  return 'other';
}

/**
 * Calculate category totals from receipts using corrected categories.
 *
 * @param receipts - Array of receipts
 * @param userMappings - User's product mappings
 * @param globalMappings - Global product mappings
 * @returns Object with category keys and total amounts
 */
export function calculateCategoryTotals(
  receipts: { items: unknown }[],
  userMappings: ProductMapping[] | undefined,
  globalMappings: GlobalProductMapping[] | undefined
): Record<string, number> {
  const categoryTotals: Record<string, number> = {};

  receipts.forEach(receipt => {
    const items = (receipt.items as ReceiptItem[]) || [];
    items.forEach(item => {
      if (!item.name) return;

      const category = getCategoryForItem(
        item.name,
        userMappings,
        globalMappings,
        item.category
      );

      const price = Number(item.price || 0);
      categoryTotals[category] = (categoryTotals[category] || 0) + price;
    });
  });

  return categoryTotals;
}

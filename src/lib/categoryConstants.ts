/**
 * Shared category constants for product categorization
 * Used across the application for consistent category handling
 */

export const CATEGORY_KEYS = {
  FRUKT_OCH_GRONT: 'frukt_och_gront',
  MEJERI: 'mejeri',
  KOTT_FAGEL_CHARK: 'kott_fagel_chark',
  FISK_SKALDJUR: 'fisk_skaldjur',
  BROD_BAGERI: 'brod_bageri',
  SKAFFERI: 'skafferi',
  FRYSVAROR: 'frysvaror',
  DRYCKER: 'drycker',
  SOTSAKER_SNACKS: 'sotsaker_snacks',
  FARDIGMAT: 'fardigmat',
  HUSHALL_HYGIEN: 'hushall_hygien',
  DELIKATESS: 'delikatess',
  PANT: 'pant',
  OTHER: 'other',
} as const;

export const categoryNames: Record<string, string> = {
  [CATEGORY_KEYS.FRUKT_OCH_GRONT]: 'Frukt och grönt',
  [CATEGORY_KEYS.MEJERI]: 'Mejeri',
  [CATEGORY_KEYS.KOTT_FAGEL_CHARK]: 'Kött, fågel, chark',
  [CATEGORY_KEYS.FISK_SKALDJUR]: 'Fisk och skaldjur',
  [CATEGORY_KEYS.BROD_BAGERI]: 'Bröd och bageri',
  [CATEGORY_KEYS.SKAFFERI]: 'Skafferi',
  [CATEGORY_KEYS.FRYSVAROR]: 'Frysvaror',
  [CATEGORY_KEYS.DRYCKER]: 'Drycker',
  [CATEGORY_KEYS.SOTSAKER_SNACKS]: 'Sötsaker och snacks',
  [CATEGORY_KEYS.FARDIGMAT]: 'Färdigmat',
  [CATEGORY_KEYS.HUSHALL_HYGIEN]: 'Hushåll och hygien',
  [CATEGORY_KEYS.DELIKATESS]: 'Delikatess',
  [CATEGORY_KEYS.PANT]: 'Pant',
  [CATEGORY_KEYS.OTHER]: 'Övrigt',
};

export const categories = Object.values(CATEGORY_KEYS);

export const categoryOptions = categories
  .map(key => ({
    value: key,
    label: categoryNames[key] || key,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'sv'));

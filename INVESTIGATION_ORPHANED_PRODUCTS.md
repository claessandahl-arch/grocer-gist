# Investigation: Orphaned Products Issue

## Problem Statement
After manually deleting all receipts from the database:
- `/product-management` shows 7 products (e.g., "Delikatess potatis", "Hushållsärs", "Kosmjölk Lätt")
- Dashboard shows 62 total products
- Expected: 0 receipts, 0 products

## Database Schema Analysis

### 1. **receipts** table
```sql
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  store_name TEXT,
  total_amount DECIMAL(10, 2),
  receipt_date DATE,
  items JSONB DEFAULT '[]'::jsonb,  -- ⚠️ Products stored as JSONB, not foreign keys
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Key Point**: Receipt items are stored as **JSONB** in the `items` column, NOT in a separate table. There is **NO foreign key relationship** to product_mappings.

### 2. **product_mappings** table (User-specific)
```sql
CREATE TABLE public.product_mappings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  original_name TEXT NOT NULL,
  mapped_name TEXT NOT NULL,  -- ⚠️ NOT NULL but can be empty string
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Purpose**: Stores user-specific product groupings (e.g., "Arla Mjölk 3%" → "Mjölk")

**No CASCADE DELETE**: When you delete receipts, product_mappings remain untouched.

### 3. **global_product_mappings** table (Shared)
```sql
CREATE TABLE public.global_product_mappings (
  id uuid PRIMARY KEY,
  original_name text NOT NULL,
  mapped_name text NOT NULL,  -- ⚠️ NOT NULL but can be empty string
  category text,
  usage_count integer DEFAULT 0,
  created_at timestamp,
  updated_at timestamp
);
```

**Purpose**: Shared product mappings seeded for all users (115 products from migration `20251115000000_seed_global_product_mappings.sql`)

**Seeded Products Include**:
- 'Mjölk', 'Banan', 'Äpple', 'Tomat', 'Potatis', 'Köttfärs', 'Kyckling', 'Korv', 'Pasta', 'Bröd', etc.

**No USER_ID**: These are global, not tied to any user.

## Root Cause Analysis

### Why 7 "Ungrouped Products"?

The 7 products you see are from **`global_product_mappings`** table that have:
- **Empty or NULL `mapped_name`** values
- OR were created/modified with empty group names

These show up as "ungrouped" in ProductManagement because:
```typescript
// From ProductManagement.tsx line 131-135
const mappedButUngrouped = useMemo(() => {
  const result = allMappings.filter(m => !m.mapped_name || m.mapped_name.trim() === '');
  return result;
}, [allMappings]);
```

### Why 62 Total Products?

Dashboard is likely counting:
1. **55+ from global_product_mappings** (seeded products with proper `mapped_name`)
2. **7 from global_product_mappings** (empty `mapped_name`)
3. **0 from receipts** (you deleted them all)
4. **0 from user product_mappings** (you probably don't have any personal mappings)

Total: ~62 products

## Is This a Bug or Feature?

**This is INTENDED BEHAVIOR** with a design flaw:

### Intended:
- ✅ Product mappings persist after deleting receipts (allows users to build a mapping library)
- ✅ Global mappings provide baseline for all users (reduces manual work)
- ✅ Deleting receipts doesn't cascade to mappings (preserves user's grouping work)

### Design Flaw:
- ❌ **Global mappings** shouldn't have empty `mapped_name` values
- ❌ No cleanup tool for orphaned user mappings
- ❌ No distinction between "used" and "unused" mappings
- ❌ Dashboard counts mappings even when no receipts use them

## Complete Cleanup SQL

Run these SQL commands in Supabase SQL Editor to achieve **100% clean state**:

```sql
-- =================================================================
-- COMPLETE DATABASE CLEANUP
-- WARNING: This will delete ALL data. Cannot be undone.
-- =================================================================

-- Step 1: Delete all user-specific data
DELETE FROM public.receipts;
DELETE FROM public.product_mappings;
DELETE FROM public.receipt_corrections;
DELETE FROM public.ignored_merge_suggestions;
DELETE FROM public.category_suggestion_feedback;
DELETE FROM public.user_global_overrides;

-- Step 2: Clean up global_product_mappings with empty/null mapped_name
DELETE FROM public.global_product_mappings
WHERE mapped_name IS NULL OR mapped_name = '';

-- Step 3 (OPTIONAL): Reset global mappings to original seed state
-- Only run this if you want to remove ALL global mappings
-- DELETE FROM public.global_product_mappings;
-- Then re-run the seed migration or keep them for future use

-- Verification queries:
SELECT 'receipts' as table_name, COUNT(*) as count FROM public.receipts
UNION ALL
SELECT 'product_mappings', COUNT(*) FROM public.product_mappings
UNION ALL
SELECT 'global_product_mappings', COUNT(*) FROM public.global_product_mappings
UNION ALL
SELECT 'global_empty_names', COUNT(*) FROM public.global_product_mappings WHERE mapped_name IS NULL OR mapped_name = '';
```

Expected result after cleanup:
- `receipts`: 0
- `product_mappings`: 0
- `global_product_mappings`: 55-110 (valid seed data, depends on if you kept step 3 commented)
- `global_empty_names`: 0

## Alternative: Use Diagnostics Page

PR #77 (currently pending) adds functionality to clean up empty mappings via UI:

1. Go to `/diagnostics`
2. Click "Rensa tomma kopplingar" (Clean empty mappings)
3. This will delete both user and global mappings with empty `mapped_name`

After PR #77 is merged, this becomes the recommended way to clean up.

## Proposed Code Fix: Automatic Cleanup

To prevent future orphaned mappings, we could add:

### Option 1: Add "usage tracking"
Track which mappings are actually used in receipts and hide/delete unused ones:

```sql
-- Add last_used_at column
ALTER TABLE product_mappings ADD COLUMN last_used_at TIMESTAMP;

-- Update when receipt is created
-- Requires application code change
```

### Option 2: Cascade delete (NOT RECOMMENDED)
This would lose user's mapping work when they delete receipts:

```sql
-- NOT RECOMMENDED - Users would lose their grouping work
-- Would require restructuring to use foreign keys instead of JSONB
```

### Option 3: Add "orphan cleanup" scheduled job
Periodically delete mappings for products that haven't been seen in receipts for X days.

## Recommendation

**For immediate cleanup**:
1. Run the SQL cleanup commands above
2. Merge PR #77 for UI-based cleanup tool

**For long-term solution**:
- Keep global_product_mappings as-is (it's a valuable feature)
- Add validation to prevent empty `mapped_name` values
- Consider adding a "usage_count" based on actual receipt items
- Add UI to hide/show unused mappings

## Database Relationship Diagram

```
┌─────────────────┐
│   receipts      │
│ ─────────────── │
│ id (PK)         │
│ user_id         │
│ items (JSONB) ────┐ (No FK relationship!)
└─────────────────┘  │
                      │
                      ↓
                 [Product names in JSON]
                      │
                      ↓ (Matched by name string)
┌─────────────────────────────────┐
│   product_mappings              │
│ ─────────────────────────────── │
│ id (PK)                         │
│ user_id                         │
│ original_name ←─────────────────┘
│ mapped_name                     │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│   global_product_mappings       │
│ ─────────────────────────────── │
│ id (PK)                         │
│ original_name ←─────────────────┐
│ mapped_name                     │
│ (NO user_id - shared by all)   │
└─────────────────────────────────┘
```

**Key Insight**: Products in receipts are NOT foreign keys. They're just strings in JSONB that are matched against mapping tables by name.


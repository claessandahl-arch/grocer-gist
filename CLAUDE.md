# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a grocery receipt tracking application that uses AI to parse receipt images and PDFs, extract structured data, and provide spending insights. The app is built with React, TypeScript, Vite, shadcn-ui, and Supabase.

**Project Stats:**
- ~13,754 lines of TypeScript/TSX code
- 24 SQL migration files (1,229 lines)
- 3 Supabase Edge Functions
- 50+ shadcn-ui components
- 9 main application routes

## Lovable Integration

This project is actively developed with Lovable.ai:
- Project URL: https://lovable.dev/projects/f21d8444-2059-42cc-a52a-739ae8a6d579
- Changes via Lovable auto-commit to this repo
- Local changes pushed to repo sync with Lovable
- AI Gateway uses Lovable API key for Gemini access

## Git Workflow

**IMPORTANT**: This repository is used alongside Lovable.ai. Always follow these rules:

1. **Never commit directly to `main`** - Always create a separate branch for changes
2. **Create pull requests** - All changes must go through PR workflow
3. **DO NOT auto-merge PRs** - Create the PR and STOP. Let the user review and merge manually
4. **Never force push** - Avoid `git push --force` or `git push -f` at all times
5. **Pull latest changes** - Always run `git pull` before starting work
6. **Sync frequently** - Keep your local repository in sync with remote
7. **Database Access** - You CANNOT access the database directly. It is managed by Lovable Cloud. Use migrations for schema changes.

Example workflow:
```bash
# Create a new branch for your changes
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push branch and create PR
git push -u origin feature/your-feature-name

# Use gh CLI to create PR
gh pr create --title "Your PR title" --body "Description"

# STOP HERE - Do NOT run 'gh pr merge'
# Let the user review and merge the PR manually
```

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (port: 8080, not 5173)
npm run dev

# Build for production
npm run build

# Build in development mode
npm run build:dev

# Lint the codebase
npm run lint

# Preview production build
npm preview
```

**Development Server Configuration:**
- Port: 8080 (not the default 5173)
- Host: `::` (IPv6)
- Access at: http://localhost:8080

## Architecture

### Project Structure

**Source Directory (`src/`):**
- `/components/` - Organized by feature (dashboard, datamanagement, product-management, training, ui)
- `/pages/` - Route components (Index, Dashboard, Upload, Training, DataManagement, ProductManagement, PriceComparison, DiagnosticTool, Auth, NotFound)
- `/lib/` - Utility functions and constants (categoryConstants, categoryUtils, logger, utils)
- `/types/` - TypeScript type definitions (receipt.ts, dashboardTypes.ts)
- `/integrations/` - Supabase client and generated types
- `/hooks/` - Custom React hooks (use-toast, use-mobile)

**Supabase Directory:**
- `/functions/` - 3 Edge Functions (parse-receipt, suggest-categories, suggest-product-groups)
- `/migrations/` - 24 SQL migration files

### Navigation & Routes

The application has the following routes (all lazy-loaded for performance):

- `/` - Landing page (Index)
- `/dashboard` - Analytics dashboard with monthly navigation
- `/upload` - Receipt upload with PDF conversion
- `/training` - Manual correction interface with ProductMerge and AICategorization
- `/datamanagement` - Bulk category editing and product management
- `/product-management` - Product grouping and merging with AI assistance
- `/price-comparison` - Unit price comparison across stores
- `/diagnostic` - Diagnostic tool for troubleshooting
- `/auth` - Authentication page
- `*` - 404 Not Found (must be last route)

**Navigation Component Features:**
- Mobile-responsive with hamburger menu
- User dropdown with email and logout
- Auth state listening via Supabase
- Hides on /auth page

### Core Data Flow

1. **Receipt Upload** (`/upload`): Users upload images or PDFs of grocery receipts
   - PDFs are converted to JPG images client-side using `pdfjs-dist` (scale: 2.0, quality: 0.9)
   - Multi-page PDFs are split into individual pages
   - Files are sanitized (removing Swedish characters: å→a, ä→a, ö→o) before uploading to Supabase Storage
   - Duplicate detection checks (date + amount + fuzzy store name match)

2. **AI Parsing**: Images are sent to the `parse-receipt` Supabase Edge Function
   - Uses `google/gemini-2.5-flash` via Lovable AI Gateway
   - **New**: Supports direct PDF text extraction (if PDF URL provided) for 100% accuracy
   - **New**: Enhanced Swedish abbreviation handling (st, kg, pant, rabatt)
   - Applies learned patterns from `store_patterns` table for improved accuracy
   - Extracts: store name, total amount, date, and itemized list with categories
   - Handles multi-line product names and discount parsing
   - Multi-page receipts are combined into a single parsed receipt
   - Error handling for rate limits (429) and credit depletion (402)

3. **Training System** (`/training`): Manual correction interface to improve parsing accuracy
   - Users can review and correct AI-parsed receipts
   - Corrections are saved to `receipt_corrections` table
   - Updates `store_patterns` table with learned categorizations
   - The AI parser uses these patterns to improve future parsing for similar stores
   - Includes ProductMerge component for consolidating duplicate product names
   - Includes AICategorization component for AI-assisted category suggestions

4. **Dashboard** (`/dashboard`): Analytics and insights
   - Monthly spending summaries with navigation between months
   - Server-side aggregated views for optimal performance
   - Category breakdowns using recharts (pie/bar charts)
   - Store comparisons with visit counts
   - Uses corrected categories based on priority system

5. **Product Management** (`/product-management`): Product grouping and merging
   - Ungrouped products list with occurrence counts
   - Product groups list showing merged products
   - Auto-grouping feature using AI (suggest-product-groups Edge Function)
   - User-specific mappings (`product_mappings` table)
   - Global mappings (`global_product_mappings` table) - seeded with 115+ common Swedish products
   - Ignored merge suggestions tracking

6. **Price Comparison** (`/price-comparison`): Unit price analysis
   - Uses `view_price_comparison` for unit price calculations
   - Extracts unit info from product names (kg, g, l, ml, st, etc.)
   - Normalizes units (g→kg, ml→l, pack→st)
   - Shows min/avg/max price per unit
   - Identifies best store for each product

7. **Data Management** (`/datamanagement`): Bulk editing
   - Product search and filtering
   - Category assignment for products
   - Both user and global mapping management
   - Stats showing total products, categorized, uncategorized

### Authentication

- Uses Supabase Auth with email/password
- Protected routes check for session and redirect to /auth
- Navigation component listens for auth state changes
- RLS policies enforce user data isolation
- Auth page hidden from navigation when logged in

### Database Schema (Supabase)

**Core Tables:**

1. **receipts** - Main receipt data
   - Columns: `id`, `user_id`, `image_url`, `image_urls` (array for multi-page), `store_name`, `total_amount`, `receipt_date`
   - `items` (JSONB) - array of {name, price, quantity, category, discount?}
   - RLS policies: users can CRUD their own receipts

2. **receipt_corrections** - Training data for AI improvement
   - Tracks manual corrections for AI training
   - Columns: `id`, `receipt_id`, `user_id`, `original_data`, `corrected_data`, `correction_notes`
   - RLS policies: users can CRUD their own corrections

3. **store_patterns** - Learned item categorization patterns
   - Used by parse-receipt function to improve accuracy
   - Columns: `id`, `store_name`, `pattern_data` (JSONB), `success_rate`, `usage_count`
   - Public read access (anyone can view patterns)

4. **product_mappings** - User-specific product grouping
   - Columns: `id`, `user_id`, `original_name`, `mapped_name`, `category`
   - `quantity_amount`, `quantity_unit` (for price comparison)
   - RLS policies: users can CRUD their own mappings

5. **global_product_mappings** - Shared product mappings
   - Seeded with 115+ common Swedish products
   - Columns: `id`, `original_name`, `mapped_name`, `category`, `usage_count`
   - `quantity_amount`, `quantity_unit`
   - No user_id (global for all users)

6. **user_global_overrides** - User-specific overrides for global mappings
   - Allows users to customize global mapping categories locally
   - Columns: `id`, `user_id`, `global_mapping_id`, `override_category`

7. **ignored_merge_suggestions** - Tracks dismissed product merge suggestions
   - Prevents showing ignored suggestions repeatedly
   - Columns: `id`, `user_id`, `products` (array)

8. **category_suggestion_feedback** - Tracks AI category suggestion feedback
   - Used for improving future AI suggestions
   - Columns: `id`, `user_id`, `product_name`, `suggested_category`, `accepted`

9. **global_mapping_changes** - Audit log for global mapping modifications
   - Tracks who changed what and when
   - Columns: `id`, `mapping_id`, `changed_by`, `change_type`, `old_value`, `new_value`

**Database Views (Server-side Aggregation):**

1. **view_monthly_stats** - Monthly aggregated statistics per user
   - Columns: `user_id`, `year_month`, `total_spend`, `receipt_count`, `avg_per_receipt`
   - Improves dashboard performance by pre-calculating totals

2. **view_category_breakdown** - Spending by category per month with corrected categories
   - Applies category correction priority: user mappings > global mappings > receipt category > 'other'
   - Columns: `user_id`, `year_month`, `category`, `total_spend`, `item_count`

3. **view_store_comparison** - Spending by store per month
   - Columns: `user_id`, `year_month`, `store_name`, `total_spend`, `receipt_count`, `avg_per_visit`

4. **view_price_comparison** - Unit price comparison across products and stores
   - Uses `extract_unit_info()` function for quantity normalization
   - Columns: `user_id`, `mapped_name`, `store_name`, `min_price_per_unit`, `avg_price_per_unit`, `max_price_per_unit`, `purchase_count`

**Database Functions:**

- `extract_unit_info(product_name TEXT)` - Extracts quantity and unit from product names
  - Returns: `{amount: NUMERIC, unit: TEXT}`
  - Handles: kg, g, l, ml, st, pack, etc.
  - Normalizes units (g→kg, ml→l)

- `update_updated_at_column()` - Trigger function for automatic timestamp updates
  - Sets `updated_at = NOW()` on row updates

### Category Correction System

The application uses a sophisticated category correction priority system to ensure accurate analytics:

**Priority Order (highest to lowest):**
1. **User mappings** (`product_mappings.category`) - User's explicit categorization
2. **Global mappings** (`global_product_mappings.category`) - Shared product database
3. **Receipt category** - AI-parsed from receipt
4. **Fallback** - 'other' category

**Implementation:**
- `src/lib/categoryUtils.ts`: `getCategoryForItem()` function
- Dashboard views use LEFT JOINs with COALESCE to apply priority
- All analytics respect this priority order
- ProductManagement and DataManagement allow editing both user and global mappings

### Key Technical Patterns

**Category System**: Product categories are defined in `src/lib/categoryConstants.ts` with Swedish labels:
- Uses constant keys (e.g., `CATEGORY_KEYS.FRUKT_OCH_GRONT`)
- Provides display names via `categoryNames` mapping
- Exports `categories` array and `categoryOptions` for form selects
- Always use these constants instead of hardcoding category values
- 14 total categories covering all grocery items

**Receipt Items Structure**:
```typescript
interface ReceiptItem {
  name: string;
  price: number;       // Final price after discount
  quantity: number;
  category: string;    // One of the CATEGORY_KEYS
  discount?: number;   // Optional discount amount (positive number)
}
```

**Discount Handling**: The AI parser is specifically trained to:
- Combine multi-line product names (e.g., "Juicy Melba" + "Nocco" on next line)
- Never create items with negative prices
- Apply discount lines to the product above them
- Store the final price and discount separately

**Multi-page Receipt Handling**:
- Multiple images are automatically detected and grouped during upload
- PDFs converted page-by-page with scale: 2.0, quality: 0.9
- All pages uploaded to storage with sequential numbering
- The AI receives all image URLs in page order
- Receipt record stores both `image_url` (first page) and `image_urls` (all pages array)
- Edge function accepts `imageUrls` array (preferred) or legacy `imageUrl`

**Duplicate Detection**: When uploading receipts, the system checks for duplicates by:
- Matching `receipt_date` and `total_amount`
- Fuzzy matching store names (handles variations like "ICA" vs "ICA Nära")

## Supabase Edge Functions

Location: `supabase/functions/`

### 1. parse-receipt

**Purpose:** Parse receipt images using AI (Gemini 2.5 Flash)

**Input:**
- `imageUrls` (array) or legacy `imageUrl` (single string)
- `originalFilename` (optional) - for date hint extraction

**Features:**
- Multi-page receipt support
- **Direct PDF text extraction** (hybrid approach: uses text layer if available)
- Store pattern learning from `store_patterns` table
- Sophisticated prompt engineering for accurate extraction
- **Swedish abbreviation rules** (st, kg, pant, rabatt)
- Discount/rebate handling (negative amounts applied to previous product)
- Multi-line product name detection
- Never creates items with negative prices
- Category mapping to 14 Swedish categories

**Output:**
```typescript
{
  store_name: string;
  total_amount: number;
  receipt_date: string; // ISO date
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    category: string;
    discount?: number;
  }>;
}
```

**Error Handling:**
- Rate limits (429) from AI gateway
- Credit depletion (402)
- Invalid image formats

**Environment Variables:**
- `LOVABLE_API_KEY` - For AI gateway access
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - For accessing store patterns

### 2. suggest-categories

**Purpose:** AI-assisted category suggestions for products

**Input:**
```typescript
{
  products: Array<{
    name: string;
    occurrences: number;
  }>;
  userId: string;
}
```

**Process:**
- Fetches training data from user mappings, global mappings, and receipts
- Fetches previous feedback from `category_suggestion_feedback` table for learning
- Builds Swedish-language prompt with examples
- Calls Lovable AI Gateway with Gemini

**Output:**
```typescript
{
  suggestions: Array<{
    product: string;
    category: string;
    confidence: number; // 0-1
    reasoning: string;
  }>;
}
```

**Learning:** Improves over time by analyzing user feedback from `category_suggestion_feedback` table

### 3. suggest-product-groups

**Purpose:** AI-assisted product grouping suggestions within categories

**Input:**
```typescript
{
  userId: string;
  category: string;
  products: Array<{
    name: string;
    occurrences: number;
  }>;
}
```

**Process:**
- Analyzes products within the same category
- Groups similar products (spelling variants, brand variations)
- Uses occurrence counts for weighting suggestions
- 50-second timeout for large product lists

**Output:**
```typescript
{
  suggestions: Array<{
    groupName: string;
    products: string[];
    confidence: number; // 0-1
    reasoning: string;
  }>;
}
```

## Database Migrations

Location: `supabase/migrations/`

This project uses Supabase migrations to manage database schema changes. 24 migration files totaling 1,229 lines of SQL.

Migrations are automatically applied when:
- Deploying through Lovable.ai
- Using Supabase CLI with `supabase db push` or `supabase db reset`

> [!IMPORTANT]
> **Lovable Cloud Database**: The database is hosted on Lovable Cloud and is fully managed by Lovable. You CANNOT access it via an external Supabase dashboard or CLI using standard credentials. All schema changes must be applied by creating migration files and asking Lovable to execute them.

### Key Recent Migrations

**20251121000000** - Dashboard views
- `view_monthly_stats` - Monthly aggregated statistics
- `view_category_breakdown` - Spending by category with corrections
- `view_store_comparison` - Spending by store

**20251120000000** - Price comparison schema
- `extract_unit_info()` function for unit extraction
- `view_price_comparison` view for price analytics

**20251118000000** - Category suggestion feedback tracking
- `category_suggestion_feedback` table for AI learning

**20251116000000** - User global overrides
- `user_global_overrides` table for local customization

**20251115000000** - Seed global product mappings
- Seeds `global_product_mappings` with 115+ common Swedish grocery products
- Provides baseline product name standardization for all users

## Performance Optimizations

1. **Code Splitting**: All routes are lazy loaded using React.lazy()
   - Reduces initial bundle size
   - Faster initial page load

2. **Virtualization**: ProductMerge uses react-window (v2.2.3) for large lists
   - Only renders visible items
   - Handles 1000+ products smoothly

3. **Server-side Aggregation**: Dashboard uses database views instead of client-side calculations
   - Pre-calculated monthly stats
   - Pre-applied category corrections
   - Significantly faster dashboard rendering

4. **Query Caching**: TanStack Query with configurable staleTime and refetchOnMount
   - Critical data: `staleTime: 0`, `refetchOnMount: true`
   - Less critical data: `staleTime: 5 * 60 * 1000` (5 minutes)

5. **Debouncing**: Search inputs use use-debounce (10.0.6)
   - Reduces unnecessary re-renders
   - Prevents excessive API calls

## Important Implementation Notes

1. **Path Aliases**: Use `@/` for imports (configured in tsconfig.json)
   - Example: `import { supabase } from "@/integrations/supabase/client"`

2. **Routing**: All custom routes must be added ABOVE the catch-all `*` route in `App.tsx`
   - Routes are lazy-loaded with React.lazy()
   - Loading states handled with Suspense

3. **File Sanitization**: Always use the `sanitizeFilename` function when uploading files to prevent storage errors with Swedish characters
   - Converts: å→a, ä→a, ö→o
   - Location: Upload component

4. **Category Consistency**: Always import and use constants from `src/lib/categoryConstants.ts` rather than hardcoding category strings
   - Use `CATEGORY_KEYS` for values
   - Use `categoryNames` for display
   - Use `categoryOptions` for selects

5. **Query Client**: TanStack Query is configured at the app level. Use `useQuery` for data fetching
   - **Cache Control Best Practices**: When changing query keys or fetching critical data:
     - Use `refetchOnMount: true` to force fresh data when component mounts
     - Use `staleTime: 0` to bypass cache for real-time accuracy requirements
     - Use `refetchOnWindowFocus: false` to prevent unnecessary refetches
     - Example from ProductManagement (requires fresh data):
       ```typescript
       useQuery({
         queryKey: ['receipts-all'],
         queryFn: async () => { /* ... */ },
         refetchOnMount: true,  // Force fresh data
         staleTime: 0,          // Never use cache
       });
       ```
     - Example from ProductMerge (can use stale data):
       ```typescript
       useQuery({
         queryKey: ['receipts', receiptLimit],
         queryFn: async () => { /* ... */ },
         staleTime: 5 * 60 * 1000,      // Cache for 5 minutes
         refetchOnWindowFocus: false,   // Don't refetch on focus
       });
       ```
   - **Debugging Data Flow**: Add console.log statements at each data transformation step to track where data is lost or transformed incorrectly

6. **Styling**: Uses Tailwind CSS with custom theme including gradient backgrounds (`bg-gradient-hero`) and shadow utilities (`shadow-card`, `shadow-soft`)
   - Custom CSS variables defined in `index.css`
   - Dark mode support with class strategy

7. **UI Components**: shadcn-ui components are in `src/components/ui/`. Do not modify these directly; use className props to customize
   - 50+ pre-built components based on Radix UI primitives
   - Fully accessible and keyboard navigable

8. **Date Handling**: Uses `date-fns` with Swedish locale (`sv`) for date formatting and manipulation
   - Import locale: `import { sv } from 'date-fns/locale'`
   - Format with locale: `format(date, 'PPP', { locale: sv })`

9. **TypeScript Configuration**: Relaxed strictness (`noImplicitAny: false`, `strictNullChecks: false`) for development speed
   - Not recommended for production apps
   - Trade-off: faster development vs type safety

10. **Virtualization with react-window**: Uses v2 API (not v1)
    - Import: `import { List } from "react-window"`
    - Props: `rowProps`, `rowHeight`, `rowCount`, `defaultHeight`, `rowComponent`
    - Row components receive props directly (not nested in `data` object)

## Testing Receipts

When testing the upload functionality:
- The system handles both single images and multi-page PDFs
- PDF conversion happens client-side (no server processing needed)
- Duplicate detection prevents the same receipt from being uploaded multiple times
- Check the console for detailed parsing logs from the Edge Function
- Test with various receipt formats (ICA, Coop, Willys, etc.)
- Multi-page PDFs are automatically split and processed together

## Common Issues & Solutions

1. **Build Error: "FixedSizeList" not exported**
   - Solution: Use `List` from react-window v2 API, not `FixedSizeList` from v1

2. **Swedish Characters in Filenames**
   - Solution: Always use `sanitizeFilename()` before uploading

3. **Dashboard Not Showing Data**
   - Check: RLS policies, user authentication, date range selection
   - Verify: Database views are created (run migrations)

4. **AI Parsing Failures**
   - Check: Lovable API key is set
   - Verify: Image URLs are accessible
   - Review: Edge function logs in Supabase dashboard

5. **Category Mismatches**
   - Understand: Category correction priority system
   - Check: User mappings and global mappings
   - Use: DataManagement page to correct categories

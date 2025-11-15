# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a grocery receipt tracking application that uses AI to parse receipt images and PDFs, extract structured data, and provide spending insights. The app is built with React, TypeScript, Vite, shadcn-ui, and Supabase.

## Git Workflow

**IMPORTANT**: This repository is used alongside Lovable.ai. Always follow these rules:

1. **Never commit directly to `main`** - Always create a separate branch for changes
2. **Create pull requests** - All changes must go through PR workflow
3. **Never force push** - Avoid `git push --force` or `git push -f` at all times
4. **Pull latest changes** - Always run `git pull` before starting work
5. **Sync frequently** - Keep your local repository in sync with remote

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
```

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (default port: 5173)
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

## Architecture

### Core Data Flow

1. **Receipt Upload** (`/upload`): Users upload images or PDFs of grocery receipts
   - PDFs are converted to JPG images client-side using `pdfjs-dist`
   - Multi-page PDFs are split into individual pages
   - Files are sanitized (removing Swedish characters: å→a, ä→a, ö→o) before uploading to Supabase Storage

2. **AI Parsing**: Images are sent to the `parse-receipt` Supabase Edge Function
   - Uses `google/gemini-2.5-flash` via Lovable AI Gateway
   - Applies learned patterns from `store_patterns` table for improved accuracy
   - Extracts: store name, total amount, date, and itemized list with categories
   - Handles multi-line product names and discount parsing
   - Multi-page receipts are combined into a single parsed receipt

3. **Training System** (`/training`): Manual correction interface to improve parsing accuracy
   - Users can review and correct AI-parsed receipts
   - Corrections are saved to `receipt_corrections` table
   - Updates `store_patterns` table with learned categorizations
   - The AI parser uses these patterns to improve future parsing for similar stores

4. **Dashboard** (`/dashboard`): Analytics and insights
   - Monthly spending summaries with navigation between months
   - Category breakdowns using recharts
   - Store comparisons
   - Product merge functionality to consolidate duplicate product names

### Database Schema (Supabase)

Key tables:
- `receipts`: Stores receipt data including `image_url`, `image_urls` (for multi-page), `store_name`, `total_amount`, `receipt_date`, `items` (JSONB)
- `receipt_corrections`: Tracks manual corrections for training the AI
- `store_patterns`: Learned item categorization patterns per store (used by AI parser)
- `global_product_mappings`: Global product name mappings with usage tracking
- `product_mappings`: User-specific product name mappings

All receipts are associated with a `user_id`. The Upload page currently uses a hardcoded `DEFAULT_USER_ID` for development.

### Key Technical Patterns

**Category System**: Product categories are defined in `src/lib/categoryConstants.ts` with Swedish labels:
- Uses constant keys (e.g., `CATEGORY_KEYS.FRUKT_OCH_GRONT`)
- Provides display names via `categoryNames` mapping
- Exports `categories` array and `categoryOptions` for form selects
- Always use these constants instead of hardcoding category values

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
- Multiple images are grouped by base filename (removing `_pageX` suffix)
- All pages are uploaded to storage with sequential numbering
- The AI receives all image URLs in page order and combines them into a single receipt
- Receipt record stores both `image_url` (first page) and `image_urls` (all pages)

**Duplicate Detection**: When uploading receipts, the system checks for duplicates by:
- Matching `receipt_date` and `total_amount`
- Fuzzy matching store names (handles variations like "ICA" vs "ICA Nära")

## Database Migrations

Location: `supabase/migrations/`

This project uses Supabase migrations to manage database schema changes. Migrations are automatically applied when:
- Deploying through Lovable.ai
- Using Supabase CLI with `supabase db push` or `supabase db reset`

### Recent Migrations

**20251115000000_seed_global_product_mappings.sql**
- Seeds the `global_product_mappings` table with 115+ common Swedish grocery products
- Provides baseline product name standardization for all users
- Includes products across all categories with realistic usage counts
- This addresses the empty state issue where users couldn't see merged products

To manually apply this migration to your Supabase project:
1. Install Supabase CLI: `npm install -g supabase`
2. Link to your project: `supabase link --project-ref mbxrezbotqxttjemwvqk`
3. Apply migrations: `supabase db push`

Alternatively, you can run the SQL directly in the Supabase Dashboard SQL Editor.

## Supabase Edge Functions

Location: `supabase/functions/parse-receipt/`

The `parse-receipt` function:
- Accepts `imageUrls` (array) or legacy `imageUrl` (single)
- Optionally accepts `originalFilename` for date hint extraction
- Fetches store patterns to improve categorization accuracy
- Returns structured receipt data matching the database schema
- Handles rate limits (429) and credit depletion (402) from AI gateway

Environment variables required:
- `LOVABLE_API_KEY`: For AI gateway access
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: For accessing store patterns

## Important Implementation Notes

1. **Path Aliases**: Use `@/` for imports (configured in tsconfig.json)
   - Example: `import { supabase } from "@/integrations/supabase/client"`

2. **Routing**: All custom routes must be added ABOVE the catch-all `*` route in `App.tsx`

3. **File Sanitization**: Always use the `sanitizeFilename` function when uploading files to prevent storage errors with Swedish characters

4. **Category Consistency**: Always import and use constants from `src/lib/categoryConstants.ts` rather than hardcoding category strings

5. **Query Client**: TanStack Query is configured at the app level. Use `useQuery` for data fetching

6. **Styling**: Uses Tailwind CSS with custom theme including gradient backgrounds (`bg-gradient-hero`) and shadow utilities (`shadow-card`, `shadow-soft`)

7. **UI Components**: shadcn-ui components are in `src/components/ui/`. Do not modify these directly; use className props to customize

8. **Date Handling**: Uses `date-fns` with Swedish locale (`sv`) for date formatting and manipulation

9. **TypeScript Configuration**: Relaxed strictness (`noImplicitAny: false`, `strictNullChecks: false`) for development speed

## Testing Receipts

When testing the upload functionality:
- The system handles both single images and multi-page PDFs
- PDF conversion happens client-side (no server processing needed)
- Duplicate detection prevents the same receipt from being uploaded multiple times
- Check the console for detailed parsing logs from the Edge Function

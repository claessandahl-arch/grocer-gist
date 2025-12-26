# TODO

## Context7 Code Review Findings (2024-12-26)

### Completed ✅

- [x] Supabase client setup - compliant with Context7 best practices
- [x] TanStack Query v5 hooks and cache management - correct patterns
- [x] React Router v6 declarative routing - properly implemented
- [x] React.lazy() + Suspense code splitting - working correctly
- [x] Pagination for Supabase 1000 row limit - implemented in ProductManagement

### Minor Improvements (Optional)

- [ ] Remove console.log statements for production builds
  - Files: `src/pages/ProductManagement.tsx` (multiple debug logs)
  
- [ ] Consider adding TypeScript types for database views
  - Current workaround: `eslint-disable @typescript-eslint/no-explicit-any` on view queries
  - Files: `src/pages/Dashboard.tsx` (lines 34, 54)

### No Action Required

The following patterns were verified and are correct:
- Supabase client auth config (persistSession, autoRefreshToken)
- TanStack Query queryKey arrays and queryFn patterns
- React Router catch-all route placement
- date-fns with Swedish locale
- useMemo for computed values
- useNavigate for programmatic navigation

---

## 🚀 Future: Lovable Migration Plan

> **Status**: NOT STARTED - Needs detailed planning
> **Priority**: When ready to self-host

### Overview

Plan to migrate off Lovable dependencies to gain full control of infrastructure.

### Phase 1: Own Supabase Instance
- [ ] Create own Supabase account/project
- [ ] Export data from Lovable Cloud database
- [ ] Run all migrations on new Supabase instance
- [ ] Update environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- [ ] Deploy Edge Functions to own Supabase project
- [ ] Migrate storage (receipt images)

### Phase 2: Replace AI Gateway
- [ ] Replace `LOVABLE_API_KEY` with direct Gemini API key
- [ ] Update Edge Functions to use Gemini API directly (or via Vertex AI)
- [ ] Test all AI features (parse-receipt, suggest-categories, etc.)

### Phase 3: (Optional) Migrate to Vercel
- [ ] Set up Vercel project
- [ ] Configure build settings for Vite
- [ ] Set up environment variables
- [ ] Configure custom domain (if needed)
- [ ] Update deployment workflow

### Current Lovable Dependencies
| Component | Lovable Dependency | Migration Target |
|-----------|-------------------|------------------|
| Database | Lovable Cloud | Own Supabase |
| Edge Functions | Lovable deploy | Supabase CLI |
| AI Gateway | `LOVABLE_API_KEY` | Direct Gemini API |
| Frontend Hosting | Lovable publish | Vercel / Netlify |

**⚠️ NOTE**: This section needs detailed step-by-step instructions before execution.

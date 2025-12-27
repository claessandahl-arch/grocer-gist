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

### Phase 2: Replace AI Gateway ✅ COMPLETE (Dec 2024)
- [x] Replace `LOVABLE_API_KEY` with direct Gemini API key (`GEMINI_API_KEY`)
- [x] Update all 5 Edge Functions to use Gemini API directly
- [x] Test all AI features (parse-receipt, suggest-categories, etc.)

### Phase 3: Frontend Cleanup ✅ COMPLETE (Dec 2024)
- [x] Remove `lovable-tagger` package
- [x] Update OpenGraph images
- [x] Update documentation (README.md, CLAUDE.md)

### Phase 1: Own Supabase Instance ✅ COMPLETE (Dec 27, 2024)
- [x] Create own Supabase account/project (Free tier)
- [x] Run all migrations on new Supabase instance (40 migrations)
- [x] Deploy Edge Functions via Supabase CLI (6 functions)
- [x] Set `GEMINI_API_KEY` secret on new Supabase
- [x] Storage bucket auto-created with policies
- [x] Update local environment variables
- [ ] Export/migrate data from Lovable Cloud (pending)

### Phase 4: (Optional) Migrate to Vercel
- [ ] Set up Vercel project
- [ ] Configure build settings for Vite
- [ ] Set up environment variables
- [ ] Configure custom domain (if needed)

### Current Status
| Component | Current State | Target |
|-----------|--------------|--------|
| AI Gateway | ✅ Direct Gemini API | Done |
| Frontend Code | ✅ Cleaned | Done |
| Database | ✅ Own Supabase (`issddemuomsuqkkrzqzn`) | Done |
| Edge Functions | ✅ Supabase CLI deployed | Done |
| Data Migration | ⏳ Pending | Export from Lovable |
| Frontend Hosting | Lovable publish | Vercel (optional) |

**📋 Detailed plan**: See `.gemini/antigravity/brain/*/implementation_plan.md` for step-by-step instructions.

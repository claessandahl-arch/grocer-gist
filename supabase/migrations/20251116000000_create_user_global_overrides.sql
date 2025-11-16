-- Create user_global_overrides table
-- This table stores user-specific category overrides for global product mappings
-- allowing users to customize categories locally without affecting other users

CREATE TABLE public.user_global_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  global_mapping_id uuid NOT NULL REFERENCES public.global_product_mappings(id) ON DELETE CASCADE,
  override_category text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- Constraint: One override per user per global mapping
  CONSTRAINT unique_user_global_override UNIQUE(user_id, global_mapping_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_global_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own overrides
CREATE POLICY "Users can view own overrides"
ON public.user_global_overrides
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own overrides
CREATE POLICY "Users can insert own overrides"
ON public.user_global_overrides
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own overrides
CREATE POLICY "Users can update own overrides"
ON public.user_global_overrides
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own overrides
CREATE POLICY "Users can delete own overrides"
ON public.user_global_overrides
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Index for fast lookups by user_id
CREATE INDEX idx_user_global_overrides_user_id
ON public.user_global_overrides(user_id);

-- Index for fast lookups by global_mapping_id
CREATE INDEX idx_user_global_overrides_global_mapping_id
ON public.user_global_overrides(global_mapping_id);

-- Trigger for automatic updated_at timestamp
CREATE TRIGGER update_user_global_overrides_updated_at
BEFORE UPDATE ON public.user_global_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add table comment for documentation
COMMENT ON TABLE public.user_global_overrides IS
'Stores user-specific category overrides for global product mappings.
Allows users to customize categories locally without affecting other users.';

-- Add column comments
COMMENT ON COLUMN public.user_global_overrides.user_id IS
'Reference to the user who created this override';

COMMENT ON COLUMN public.user_global_overrides.global_mapping_id IS
'Reference to the global product mapping being overridden';

COMMENT ON COLUMN public.user_global_overrides.override_category IS
'The category value that overrides the global mapping category for this user';

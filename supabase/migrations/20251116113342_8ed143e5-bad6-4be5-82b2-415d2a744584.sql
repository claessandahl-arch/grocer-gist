-- Create table for user-specific category overrides on global mappings
CREATE TABLE public.user_global_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  global_mapping_id uuid NOT NULL REFERENCES global_product_mappings(id) ON DELETE CASCADE,
  override_category text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(user_id, global_mapping_id)
);

-- Enable RLS
ALTER TABLE public.user_global_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own overrides"
  ON public.user_global_overrides
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own overrides"
  ON public.user_global_overrides
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own overrides"
  ON public.user_global_overrides
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own overrides"
  ON public.user_global_overrides
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_user_global_overrides_user_id ON public.user_global_overrides(user_id);
CREATE INDEX idx_user_global_overrides_global_mapping_id ON public.user_global_overrides(global_mapping_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_global_overrides_updated_at
  BEFORE UPDATE ON public.user_global_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
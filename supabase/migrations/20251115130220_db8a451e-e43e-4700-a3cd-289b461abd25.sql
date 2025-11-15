-- Create table for storing ignored product merge suggestions
CREATE TABLE IF NOT EXISTS public.ignored_merge_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  products TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, products)
);

-- Enable Row Level Security
ALTER TABLE public.ignored_merge_suggestions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own ignored suggestions" 
ON public.ignored_merge_suggestions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ignored suggestions" 
ON public.ignored_merge_suggestions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ignored suggestions" 
ON public.ignored_merge_suggestions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_ignored_suggestions_user_id ON public.ignored_merge_suggestions(user_id);
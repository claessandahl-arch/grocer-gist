-- Create table for storing parsing corrections and feedback
CREATE TABLE public.receipt_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original_data JSONB NOT NULL,
  corrected_data JSONB NOT NULL,
  correction_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.receipt_corrections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own corrections"
ON public.receipt_corrections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own corrections"
ON public.receipt_corrections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own corrections"
ON public.receipt_corrections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own corrections"
ON public.receipt_corrections FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_receipt_corrections_updated_at
BEFORE UPDATE ON public.receipt_corrections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for store-specific parsing patterns
CREATE TABLE public.store_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name TEXT NOT NULL,
  pattern_data JSONB NOT NULL,
  success_rate NUMERIC DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_name)
);

-- Enable RLS for store patterns (public read, admin write)
ALTER TABLE public.store_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view store patterns"
ON public.store_patterns FOR SELECT
USING (true);

-- Add updated_at trigger for store patterns
CREATE TRIGGER update_store_patterns_updated_at
BEFORE UPDATE ON public.store_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
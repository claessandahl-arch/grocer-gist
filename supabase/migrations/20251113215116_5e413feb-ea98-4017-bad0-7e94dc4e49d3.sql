-- Create table for manual product mappings
CREATE TABLE public.product_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_name TEXT NOT NULL,
  mapped_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own mappings"
ON public.product_mappings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mappings"
ON public.product_mappings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mappings"
ON public.product_mappings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mappings"
ON public.product_mappings
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_product_mappings_updated_at
BEFORE UPDATE ON public.product_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_product_mappings_user_id ON public.product_mappings(user_id);
CREATE INDEX idx_product_mappings_original_name ON public.product_mappings(user_id, original_name);
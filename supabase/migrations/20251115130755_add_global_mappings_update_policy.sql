-- Add UPDATE policy for global product mappings
-- This allows authenticated users to rename global product groups

-- Add UPDATE policy
CREATE POLICY "Authenticated users can update global mappings"
ON public.global_product_mappings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Create audit table to track changes to global mappings
CREATE TABLE public.global_mapping_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mapping_id uuid NOT NULL,
  old_mapped_name text NOT NULL,
  new_mapped_name text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fk_mapping
    FOREIGN KEY (mapping_id)
    REFERENCES public.global_product_mappings(id)
    ON DELETE CASCADE
);

-- Enable RLS on audit table
ALTER TABLE public.global_mapping_changes ENABLE ROW LEVEL SECURITY;

-- Anyone can view the change history
CREATE POLICY "Anyone can view global mapping changes"
ON public.global_mapping_changes
FOR SELECT
USING (true);

-- Only authenticated users can insert change records
CREATE POLICY "Authenticated users can log changes"
ON public.global_mapping_changes
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_global_mapping_changes_mapping_id ON public.global_mapping_changes(mapping_id);
CREATE INDEX idx_global_mapping_changes_changed_by ON public.global_mapping_changes(changed_by);
CREATE INDEX idx_global_mapping_changes_changed_at ON public.global_mapping_changes(changed_at DESC);

-- Create function to automatically log changes to global mappings
CREATE OR REPLACE FUNCTION log_global_mapping_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if mapped_name actually changed
  IF OLD.mapped_name IS DISTINCT FROM NEW.mapped_name THEN
    INSERT INTO public.global_mapping_changes (
      mapping_id,
      old_mapped_name,
      new_mapped_name,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.mapped_name,
      NEW.mapped_name,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log changes
CREATE TRIGGER on_global_mapping_update
AFTER UPDATE ON public.global_product_mappings
FOR EACH ROW
EXECUTE FUNCTION log_global_mapping_change();

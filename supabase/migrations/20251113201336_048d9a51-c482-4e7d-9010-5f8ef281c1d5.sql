-- Add RLS policies for store_patterns table so users can contribute corrections
CREATE POLICY "Authenticated users can insert store patterns"
ON store_patterns
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update store patterns"
ON store_patterns
FOR UPDATE
TO authenticated
USING (true);
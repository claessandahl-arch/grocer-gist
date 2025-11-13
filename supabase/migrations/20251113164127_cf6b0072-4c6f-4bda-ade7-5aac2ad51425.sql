-- Make receipts bucket public so AI can access images
UPDATE storage.buckets 
SET public = true 
WHERE id = 'receipts';

-- Update storage policies to allow public read access
CREATE POLICY "Public read access for AI processing"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');
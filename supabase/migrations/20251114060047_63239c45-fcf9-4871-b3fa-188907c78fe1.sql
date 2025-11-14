-- Add support for multiple image URLs per receipt
ALTER TABLE public.receipts 
ADD COLUMN image_urls JSONB DEFAULT '[]'::jsonb;

-- Make the old image_url column nullable for backward compatibility
ALTER TABLE public.receipts 
ALTER COLUMN image_url DROP NOT NULL;

-- Update existing receipts to have image_urls array
UPDATE public.receipts 
SET image_urls = jsonb_build_array(image_url)
WHERE image_urls = '[]'::jsonb;
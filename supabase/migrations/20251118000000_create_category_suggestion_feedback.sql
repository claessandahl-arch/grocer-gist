-- Create table for storing category suggestion feedback
-- This helps the AI improve over time by learning from user corrections

CREATE TABLE IF NOT EXISTS category_suggestion_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  suggested_category TEXT NOT NULL,
  final_category TEXT NOT NULL,
  accepted BOOLEAN NOT NULL, -- true if user accepted suggestion, false if corrected
  confidence NUMERIC, -- AI confidence score (0-1)
  reasoning TEXT, -- AI's reasoning for the suggestion
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_category_feedback_user_id ON category_suggestion_feedback(user_id);
CREATE INDEX idx_category_feedback_product ON category_suggestion_feedback(product_name);
CREATE INDEX idx_category_feedback_created ON category_suggestion_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE category_suggestion_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own feedback"
  ON category_suggestion_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback"
  ON category_suggestion_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow service role to read all feedback (for AI training)
CREATE POLICY "Service role can read all feedback"
  ON category_suggestion_feedback
  FOR SELECT
  TO service_role
  USING (true);

-- Add helpful comment
COMMENT ON TABLE category_suggestion_feedback IS 'Stores user feedback on AI category suggestions to improve future predictions';

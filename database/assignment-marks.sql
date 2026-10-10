-- Keep the original three scores alongside the existing assignment average.
ALTER TABLE marks ADD COLUMN IF NOT EXISTS assignment_scores jsonb;

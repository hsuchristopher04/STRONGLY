ALTER TABLE goals ADD COLUMN IF NOT EXISTS featured integer NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS completed_at text;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS archived_at text;
CREATE UNIQUE INDEX IF NOT EXISTS goals_one_featured_per_user ON goals (user_id) WHERE featured = 1;

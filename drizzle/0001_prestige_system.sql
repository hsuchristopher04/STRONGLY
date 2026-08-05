CREATE TABLE prestige_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  points integer NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX prestige_source_once ON prestige_ledger (user_id, source_type, source_id);

INSERT INTO prestige_ledger (id,user_id,points,reason,source_type,source_id,created_at)
SELECT 'prestige_migration_' || id,user_id,3,'Daily quest complete','daily-award',id,completed_at
FROM daily_completions
ON CONFLICT DO NOTHING;

DROP TABLE user_cosmetics;
DROP TABLE cosmetics;
DROP TABLE coin_ledger;

ALTER TABLE daily_quests DROP COLUMN reward;
ALTER TABLE weekly_quests DROP COLUMN reward;
ALTER TABLE milestones DROP COLUMN reward;
ALTER TABLE users DROP COLUMN equipped_theme;
ALTER TABLE users DROP COLUMN equipped_badge;

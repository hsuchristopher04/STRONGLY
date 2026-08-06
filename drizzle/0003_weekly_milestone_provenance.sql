ALTER TABLE milestones ADD COLUMN completed_by_weekly_quest_id text;
CREATE INDEX milestones_weekly_completion_source ON milestones (completed_by_weekly_quest_id);

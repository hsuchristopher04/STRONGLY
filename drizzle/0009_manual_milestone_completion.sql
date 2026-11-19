-- Weekly quests may reference milestones for context, but milestone completion is manual.
-- Preserve existing completion state while removing the obsolete automatic provenance lock.
UPDATE milestones
SET completed_by_weekly_quest_id = NULL
WHERE completed_by_weekly_quest_id IS NOT NULL;

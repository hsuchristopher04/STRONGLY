import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  equippedTheme: text("equipped_theme").notNull().default("obsidian"),
  equippedBadge: text("equipped_badge").notNull().default("founder"),
  createdAt: text("created_at").notNull(),
});

export const weeks = sqliteTable("weeks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  status: text("status", { enum: ["planning", "active", "closed"] }).notNull(),
}, (table) => [uniqueIndex("weeks_user_start").on(table.userId, table.startsOn)]);

export const dailyQuests = sqliteTable("daily_quests", {
  id: text("id").primaryKey(),
  weekId: text("week_id").notNull().references(() => weeks.id),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["required", "bonus"] }).notNull(),
  dayIndex: integer("day_index"),
  reward: integer("reward").notNull(),
  position: integer("position").notNull(),
});

export const dailyCompletions = sqliteTable("daily_completions", {
  id: text("id").primaryKey(),
  questId: text("quest_id").notNull().references(() => dailyQuests.id),
  userId: text("user_id").notNull().references(() => users.id),
  completedOn: text("completed_on").notNull(),
  completedAt: text("completed_at").notNull(),
}, (table) => [uniqueIndex("daily_completion_once").on(table.questId, table.completedOn)]);

export const weeklyQuests = sqliteTable("weekly_quests", {
  id: text("id").primaryKey(),
  weekId: text("week_id").notNull().references(() => weeks.id),
  userId: text("user_id").notNull().references(() => users.id),
  milestoneId: text("milestone_id"),
  title: text("title").notNull(),
  reward: integer("reward").notNull().default(100),
  completedAt: text("completed_at"),
  position: integer("position").notNull(),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  targetDate: text("target_date"),
  status: text("status", { enum: ["active", "completed", "archived"] }).notNull(),
});

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  completedAt: text("completed_at"),
  reward: integer("reward").notNull().default(150),
});

export const coinLedger = sqliteTable("coin_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("coin_source_once").on(table.userId, table.sourceType, table.sourceId)]);

export const cosmetics = sqliteTable("cosmetics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["theme", "badge"] }).notNull(),
  price: integer("price").notNull(),
  description: text("description").notNull(),
});

export const userCosmetics = sqliteTable("user_cosmetics", {
  userId: text("user_id").notNull().references(() => users.id),
  cosmeticId: text("cosmetic_id").notNull().references(() => cosmetics.id),
  purchasedAt: text("purchased_at").notNull(),
}, (table) => [uniqueIndex("user_cosmetic_once").on(table.userId, table.cosmeticId)]);

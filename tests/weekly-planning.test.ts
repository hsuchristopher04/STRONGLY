import assert from "node:assert/strict";
import test from "node:test";
import { addDays, localDate, validateWeekPlan, weekBounds } from "../app/api/campaign/week-planning";

const validPlan = {
  startsOn: "2026-08-02",
  required: ["Train", "Plan tomorrow", "Read"],
  bonus: Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, titles: dayIndex === 2 ? ["Walk", "Hydrate"] : [] })),
  weekly: ["Finish project", "Meal prep"],
};

test("weeks always run Sunday through Saturday", () => {
  assert.deepEqual(weekBounds("2026-07-31"), { start: "2026-07-26", end: "2026-08-01" });
  assert.equal(addDays("2026-07-26", 7), "2026-08-02");
});

test("local dates follow timezone and daylight-saving boundaries", () => {
  const instant = new Date("2026-11-01T04:30:00Z");
  assert.equal(localDate("America/New_York", instant), "2026-11-01");
  assert.equal(localDate("America/Los_Angeles", instant), "2026-10-31");
});

test("accepts exactly three daily quests, daily bonuses, and one to three weekly quests", () => {
  const result = validateWeekPlan(validPlan, "2026-07-31");
  assert.equal(result.required.length, 3);
  assert.equal(result.bonus[2].titles.length, 2);
  assert.equal(result.weekly.length, 2);
});

test("rejects invalid quest counts and weeks beyond next week", () => {
  assert.throws(() => validateWeekPlan({ ...validPlan, required: ["One", "Two"] }, "2026-07-31"), /exactly three/i);
  assert.throws(() => validateWeekPlan({ ...validPlan, weekly: [] }, "2026-07-31"), /one and three/i);
  assert.throws(() => validateWeekPlan({ ...validPlan, bonus: [{ dayIndex: 0, titles: ["One", "Two", "Three"] }] }, "2026-07-31"), /at most two/i);
  assert.throws(() => validateWeekPlan({ ...validPlan, startsOn: "2026-08-09" }, "2026-07-31"), /current or following/i);
});

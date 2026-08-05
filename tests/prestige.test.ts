import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_QUEST_POINTS, prestigeStatus, qualifiesForStrongDay, STRONG_DAY_POINTS } from "../app/api/campaign/prestige";

test("daily quests award three prestige points", () => {
  assert.equal(DAILY_QUEST_POINTS, 3);
});

test("Strong Days award ten additional prestige points", () => {
  assert.equal(STRONG_DAY_POINTS, 10);
});

test("Strong Days require every scheduled bonus quest", () => {
  assert.equal(qualifiesForStrongDay(3, 0, 0), true);
  assert.equal(qualifiesForStrongDay(3, 2, 2), true);
  assert.equal(qualifiesForStrongDay(3, 2, 1), false);
  assert.equal(qualifiesForStrongDay(2, 0, 0), false);
});

test("prestige levels follow the exponential progression", () => {
  assert.deepEqual([0, 999, 1_000, 9_999, 10_000, 100_000].map((points) => prestigeStatus(points).level), [0, 0, 1, 1, 2, 3]);
});

test("progress is measured within the current prestige band", () => {
  assert.equal(prestigeStatus(500).progress, 50);
  assert.equal(prestigeStatus(5_500).progress, 50);
  assert.equal(prestigeStatus(-100).points, 0);
});

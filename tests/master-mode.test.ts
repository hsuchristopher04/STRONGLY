import assert from "node:assert/strict";
import test from "node:test";
import { canEditDailyQuest } from "../app/api/campaign/master-mode";

const base = { today: "2026-08-11", masterMode: false, weekStatus: "active", startsOn: "2026-08-09", endsOn: "2026-08-15", kind: "required" as const, dayIndex: null };

test("today remains editable without Master Mode", () => {
  assert.equal(canEditDailyQuest({ ...base, completedOn: base.today }), true);
});

test("Master Mode permits only earlier days in the active current week", () => {
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-10" }), false);
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-10", masterMode: true }), true);
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-12", masterMode: true }), false);
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-08", masterMode: true }), false);
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-10", masterMode: true, weekStatus: "closed" }), false);
});

test("bonus corrections remain bound to their scheduled day", () => {
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-10", masterMode: true, kind: "bonus", dayIndex: 1 }), true);
  assert.equal(canEditDailyQuest({ ...base, completedOn: "2026-08-10", masterMode: true, kind: "bonus", dayIndex: 2 }), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { weeklyRank } from "../app/api/campaign/history";

test("assigns neutral weekly ranks at every boundary", () => {
  const expected = [
    "Foundation", "Foundation", "Foundation",
    "Building", "Building",
    "Consistent", "Consistent",
    "Strong Week",
  ];
  assert.deepEqual(Array.from({ length: 8 }, (_, strongDays) => weeklyRank(strongDays)), expected);
});

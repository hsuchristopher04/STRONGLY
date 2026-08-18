import assert from "node:assert/strict";
import test from "node:test";
import { isValidTimeZone, supportedTimeZones } from "../app/timezones";

test("accepts real IANA timezones and UTC", () => {
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Asia/Tokyo"), true);
});

test("rejects empty and invented timezone identifiers", () => {
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone("STRONGLY/Moon_Base"), false);
});

test("provides the runtime's searchable timezone catalog", () => {
  const zones = supportedTimeZones();
  assert.ok(zones.length > 100);
  assert.ok(zones.includes("UTC"));
  assert.ok(zones.includes("America/New_York"));
  assert.deepEqual(zones, [...zones].sort((a, b) => a.localeCompare(b)));
});

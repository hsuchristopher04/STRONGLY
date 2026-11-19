import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_QUOTES, dailyQuote } from "../app/daily-quotes";

test("provides a substantial editable quote bank", () => {
  assert.equal(DAILY_QUOTES.length, 60);
  assert.equal(new Set(DAILY_QUOTES).size, DAILY_QUOTES.length);
});

test("the daily quote remains stable for a local calendar date and rotates the next day", () => {
  assert.equal(dailyQuote("2026-08-26"), dailyQuote("2026-08-26"));
  assert.notEqual(dailyQuote("2026-08-26"), dailyQuote("2026-08-27"));
});

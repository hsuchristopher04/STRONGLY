import assert from "node:assert/strict";
import test from "node:test";
import { expiredSessionCookie, SESSION_TTL_SECONDS, sessionCookie } from "../app/auth";
import { INVALID_CODE_MESSAGE, limited, requestAddress } from "../app/auth-security";

test("session cookies use a bounded lifetime and hardened attributes", () => {
  assert.equal(SESSION_TTL_SECONDS, 7 * 24 * 60 * 60);
  const value = sessionCookie("secret", new Date("2030-01-01T00:00:00Z"), true);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /Max-Age=604800/);
  assert.match(value, /Priority=High/);
  assert.match(value, /Secure/);
  assert.match(expiredSessionCookie(true), /Max-Age=0/);
});

test("rate-limit responses include retry and no-store headers", async () => {
  const response = limited(47);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "47");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).retryAfterSeconds, 47);
});

test("client address extraction prefers the first forwarded address", () => {
  const request = new Request("https://strongly.test", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.2" } });
  assert.equal(requestAddress(request), "203.0.113.7");
});

test("verification failures use one enumeration-resistant message", () => {
  assert.equal(INVALID_CODE_MESSAGE, "That code is invalid or expired. Request a new one.");
});

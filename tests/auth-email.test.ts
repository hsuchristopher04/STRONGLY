import assert from "node:assert/strict";
import test from "node:test";
import { EmailDeliveryError, mayExposeDevelopmentCode, resendConfiguration, sendVerificationEmail } from "../app/auth-email";

const configured = {
  RESEND_API_KEY: "re_test_key",
  AUTH_FROM_EMAIL: "STRONGLY <login@example.com>",
  AUTH_REPLY_TO: "support@example.com",
};

test("development codes are never exposed in production, even on a localhost hostname", () => {
  assert.equal(mayExposeDevelopmentCode("https://localhost/api/auth/request-code", { NODE_ENV: "production" }), false);
  assert.equal(mayExposeDevelopmentCode("http://localhost:3000/api/auth/request-code", { NODE_ENV: "development" }), true);
  assert.equal(mayExposeDevelopmentCode("http://localhost:3000/api/auth/request-code", { NODE_ENV: "development", AUTH_SHOW_DEV_CODE: "false" }), false);
  assert.equal(mayExposeDevelopmentCode("https://strongly.example/api/auth/request-code", { NODE_ENV: "development" }), false);
});

test("placeholder and malformed Resend configuration fails closed", () => {
  assert.throws(() => resendConfiguration({ RESEND_API_KEY: "re_replace_me", AUTH_FROM_EMAIL: "login@example.com" }), (error) => error instanceof EmailDeliveryError && error.status === 503);
  assert.throws(() => resendConfiguration({ RESEND_API_KEY: "re_valid", AUTH_FROM_EMAIL: "invalid" }), (error) => error instanceof EmailDeliveryError && error.status === 503);
});

test("verification delivery sends branded text and HTML through Resend with idempotency", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), init };
    return Response.json({ id: "email_123" });
  }) as typeof fetch;
  const result = await sendVerificationEmail({ to: "hero@example.com", code: "123456", requestId: "code_123", environment: configured, fetcher });
  assert.deepEqual(result, { id: "email_123" });
  assert.equal(request?.url, "https://api.resend.com/emails");
  assert.equal(new Headers(request?.init?.headers).get("authorization"), "Bearer re_test_key");
  assert.equal(new Headers(request?.init?.headers).get("idempotency-key"), "code_123");
  const body = JSON.parse(String(request?.init?.body)) as { from: string; to: string[]; reply_to: string; subject: string; text: string; html: string };
  assert.equal(body.from, configured.AUTH_FROM_EMAIL);
  assert.deepEqual(body.to, ["hero@example.com"]);
  assert.equal(body.reply_to, configured.AUTH_REPLY_TO);
  assert.match(body.subject, /123456/);
  assert.match(body.text, /expires in 10 minutes/i);
  assert.match(body.html, /STRONGLY/);
});

test("provider and malformed success responses become safe delivery errors", async () => {
  const rejected = (async () => Response.json({ message: "provider detail" }, { status: 422 })) as typeof fetch;
  await assert.rejects(sendVerificationEmail({ to: "hero@example.com", code: "123456", requestId: "one", environment: configured, fetcher: rejected }), (error) => error instanceof EmailDeliveryError && error.status === 502 && !error.message.includes("provider detail"));
  const unauthorized = (async () => Response.json({ message: "bad key" }, { status: 401 })) as typeof fetch;
  await assert.rejects(sendVerificationEmail({ to: "hero@example.com", code: "123456", requestId: "two", environment: configured, fetcher: unauthorized }), (error) => error instanceof EmailDeliveryError && error.status === 503);
  const missingId = (async () => Response.json({})) as typeof fetch;
  await assert.rejects(sendVerificationEmail({ to: "hero@example.com", code: "123456", requestId: "three", environment: configured, fetcher: missingId }), /confirm email delivery/i);
});

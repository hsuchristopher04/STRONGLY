import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the STRONGLY product experience", async () => {
  const [page, layout, app, css, packageSource, database] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Make your/);
  assert.match(layout, /STRONGLY/);
  assert.match(app, /Today/);
  assert.match(app, /Goals/);
  assert.match(app, /History/);
  assert.match(app, /Prestige/);
  assert.match(app, /walkthroughSteps/);
  assert.match(app, /Replay walkthrough/);
  assert.match(app, /Save this week/);
  assert.match(app, /Create a long-term goal/);
  assert.match(app, /position: "fixed"/);
  assert.match(app, /Settings/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.equal(JSON.parse(packageSource).scripts.dev, "next dev");
  assert.match(database, /DATABASE_URL/);
  assert.match(database, /from "pg"/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("ships passwordless email authentication", async () => {
  const [auth, requestCode, verifyCode] = await Promise.all([
    readFile(new URL("../app/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/request-code/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/verify-code/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /HttpOnly|SESSION_COOKIE/);
  assert.match(requestCode, /10 \* 60_000/);
  assert.match(requestCode, /RESEND_API_KEY/);
  assert.match(verifyCode, /attempts >= 5/);
});

test("encodes the prestige progression", async () => {
  const [appSource, prestigeSource] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/prestige.ts", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /prestige points/);
  assert.match(prestigeSource, /DAILY_QUEST_POINTS = 3/);
  assert.match(prestigeSource, /1_000/);
  assert.match(prestigeSource, /10_000/);
  assert.doesNotMatch(appSource, /coins|Shop|purchase/i);
});

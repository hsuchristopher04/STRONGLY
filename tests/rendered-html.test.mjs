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
  assert.match(app, /Shop/);
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

test("encodes the published reward economy", async () => {
  const source = await readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8");
  assert.match(source, /reward: 10/);
  assert.match(source, /reward: 15/);
  assert.match(source, /reward: 100/);
  assert.match(source, /strongDayDelta/);
});

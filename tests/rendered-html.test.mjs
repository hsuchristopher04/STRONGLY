import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the STRONGLY product experience", async () => {
  const [page, layout, app, css, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Make your/);
  assert.match(layout, /STRONGLY/);
  assert.match(app, /Today/);
  assert.match(app, /Goals/);
  assert.match(app, /History/);
  assert.match(app, /Shop/);
  assert.match(app, /Settings/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});

test("encodes the published reward economy", async () => {
  const source = await readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8");
  assert.match(source, /reward: 10/);
  assert.match(source, /reward: 15/);
  assert.match(source, /reward: 100/);
  assert.match(source, /strongDayDelta/);
});

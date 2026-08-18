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
  const [auth, authEmail, requestCode, verifyCode] = await Promise.all([
    readFile(new URL("../app/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-email.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/request-code/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/verify-code/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /HttpOnly|SESSION_COOKIE/);
  assert.match(requestCode, /10 \* 60_000/);
  assert.match(authEmail, /RESEND_API_KEY/);
  assert.match(authEmail, /NODE_ENV === "production"/);
  assert.match(requestCode, /DELETE FROM auth_codes/);
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

test("renders the authenticated user's long-term goal on Today", async () => {
  const appSource = await readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /goals=\{goals\}/);
  assert.match(appSource, /activeGoal\.title/);
  assert.match(appSource, /completedMilestones/);
  assert.match(appSource, /Create a goal/);
  assert.doesNotMatch(appSource, />Run my first half marathon</);
});

test("links the Today campaign summary to the Week screen", async () => {
  const appSource = await readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8");
  assert.match(appSource, /onViewWeek=\{\(\) => setSection\("Week"\)\}/);
  assert.match(appSource, /onClick=\{onViewWeek\}>View full week/);
});

test("ships complete goal lifecycle controls", async () => {
  const [appSource, routeSource, migration] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_goal_lifecycle.sql", import.meta.url), "utf8"),
  ]);
  for (const control of ["Show on Today", "Complete goal", "Archive", "Restore", "Delete", "Move milestone"]) assert.match(appSource, new RegExp(control, "i"));
  for (const action of ["goal-status", "feature-goal", "delete-goal"]) assert.match(routeSource, new RegExp(action));
  assert.match(routeSource, /WHERE id=\? AND user_id=\?/);
  assert.match(migration, /goals_one_featured_per_user/);
});

test("ships persistent honor-system Master Mode", async () => {
  const [appSource, routeSource, migration] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_master_mode.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /Master Mode is intended for correcting honest mistakes/);
  assert.match(appSource, /Master Mode enabled/);
  assert.match(appSource, /correctPastQuest/);
  assert.match(routeSource, /master_mode/);
  assert.match(migration, /master_mode integer NOT NULL DEFAULT 0/);
});

test("moves account controls into a verified profile panel", async () => {
  const [appSource, requestChange, verifyChange, migration] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/request-email-change/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/verify-email-change/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_verified_email_change.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /aria-label="Open profile"/);
  assert.match(appSource, /Save username/);
  assert.match(appSource, /Verify new email/);
  assert.match(appSource, /Saturday at 11:59 PM/);
  assert.doesNotMatch(appSource, /Reduced motion|Week starts Sunday/);
  assert.match(requestChange, /getAuthUser/);
  assert.match(requestChange, /purpose: "email-change"/);
  assert.match(verifyChange, /UPDATE users SET email=\?/);
  assert.match(verifyChange, /user_id=\?/);
  assert.match(migration, /email_change_codes/);
});

test("renders the Today prestige seal as live tier progress", async () => {
  const [appSource, css] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /function PrestigeSeal/);
  assert.match(appSource, /strokeDasharray=\{`\$\{percentage\} 100`\}/);
  assert.match(appSource, /onViewPrestige/);
  assert.match(css, /\.prestige-meter/);
});

test("ships searchable IANA timezone selection", async () => {
  const [appSource, timezoneSource, routeSource, css] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/timezones.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /function TimezonePicker/);
  assert.match(appSource, /role="combobox"/);
  assert.match(appSource, /Search IANA timezones/);
  assert.match(timezoneSource, /supportedValuesOf/);
  assert.match(routeSource, /isValidTimeZone\(action\.timezone\)/);
  assert.match(css, /\.timezone-options/);
  assert.doesNotMatch(appSource, /<select value=\{timezone\}/);
});

test("ships immutable weekly reflections into History", async () => {
  const [appSource, routeSource, serviceSource, migration] = await Promise.all([
    readFile(new URL("../app/strongly-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaign/week-plan-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_weekly_reflections.sql", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /CAMPAIGN JOURNAL/);
  assert.match(appSource, /label="Reflection"/);
  assert.match(appSource, /label="Quest details"/);
  assert.match(appSource, /Add reflection/);
  assert.match(appSource, /MASTER MODE · HONOR SYSTEM/);
  assert.match(appSource, /HistoryQuestDetails/);
  assert.match(appSource, /history-popover/);
  assert.doesNotMatch(appSource, /Notes for next week/);
  assert.match(routeSource, /save-week-reflection/);
  assert.match(serviceSource, /status === "closed"/);
  assert.match(serviceSource, /status !== "active"/);
  assert.match(serviceSource, /canBacktrack/);
  assert.match(migration, /ADD COLUMN reflection/);
});

test("uses neutral weekly rank boundaries", async () => {
  const historySource = await readFile(new URL("../app/api/campaign/history.ts", import.meta.url), "utf8");
  assert.match(historySource, /strongDays >= 7/);
  assert.match(historySource, /Strong Week/);
  assert.match(historySource, /Consistent/);
  assert.match(historySource, /Building/);
  assert.match(historySource, /Foundation/);
  assert.doesNotMatch(historySource, /Rebuilding|Legendary/);
});

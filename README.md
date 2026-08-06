# STRONGLY

Fantasy RPG productivity app built with standard Next.js, PostgreSQL, and passwordless email authentication. The application is provider-neutral and can run on Vercel, Azure, Render, or any Node.js host with access to PostgreSQL.

Weekly campaigns follow each user’s saved timezone and run Sunday through Saturday. Users plan exactly three repeating required daily quests, up to two day-specific bonus quests, and one to three weekly quests. The following week is always available for advance planning. On rollover, expired campaigns close permanently, the prepared week becomes active with its quests intact, and a new planning week is created automatically. If no week was prepared, STRONGLY creates a valid starter campaign so the user is never left without an active week.

## Prestige progression

Every completed daily quest, required or bonus, awards 3 prestige points. Completing all three required quests and every bonus quest scheduled for that day secures a Strong Day and awards 10 additional prestige points. Reopening any quest that breaks those conditions reverses the applicable points. Weekly quests and milestones track progress but do not award prestige points. Current prestige thresholds are 1,000, 10,000, 100,000, and 1,000,000 lifetime points. Prestige records rank and long-term consistency; it does not change the website theme.

New accounts receive a five-step walkthrough covering daily quests, weekly planning, long-term goals, History, and Prestige. Completion is saved per account, and the walkthrough can be replayed from Settings.

The Week screen lets users edit an untouched current campaign and prepare the following campaign. Weekly quests can optionally link to an owned long-term milestone; completing the quest completes that milestone automatically. Reopening the quest only reopens milestones completed by that quest, preserving milestones that were already completed manually. Once any daily or weekly quest is completed, current-week planning locks to protect completion and prestige records; reopening every completion unlocks it again. Closed campaigns remain permanently immutable. The Goals screen supports creating and editing user-authored long-term goals with optional target dates and one to ten ordered milestones.

## Requirements

- Node.js 22.13 or newer
- PostgreSQL 14 or newer
- A Resend account and verified sender domain for production email delivery

## Local setup

1. Create a free Neon project and copy its pooled PostgreSQL connection string, or use a local PostgreSQL database.
2. Copy `.env.example` to `.env.local` and replace `DATABASE_URL` with that connection string. Never commit this file.
3. Create the database schema with `npm run db:migrate`.
4. Start the app with `npm run dev`.

```powershell
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Confirm connectivity at `http://localhost:3000/api/health/database`. A successful response is:

```json
{ "status": "ok", "database": "available" }
```

Neon connection strings may include `sslmode=require`. STRONGLY removes that driver-specific query parameter and configures certificate-verified TLS directly, avoiding `pg` compatibility warnings while keeping the connection encrypted.

In local development, verification codes are shown on the sign-in screen unless `AUTH_SHOW_DEV_CODE=false`. Production never returns a verification code in an HTTP response, even if a request uses a localhost hostname.

## Production authentication email

1. Create a Resend account, verify a sending domain, and create an API key with sending access.
2. Set `RESEND_API_KEY` to the generated `re_...` key.
3. Set `AUTH_FROM_EMAIL` to an address on the verified domain, such as `STRONGLY <login@strongly.example>`.
4. Optionally set `AUTH_REPLY_TO` to a monitored support address.

Production sign-in codes are delivered through Resend as branded HTML and plain-text emails. Each request uses an idempotency key, codes expire after ten minutes, and failed deliveries remove the unusable database record so the user can retry immediately. Keep all email credentials in deployment environment variables and never commit them.

## Recommended first deployment

Deploy the Next.js application from GitHub to Vercel and add the same `DATABASE_URL` and `DATABASE_SSL=true` values in the Vercel project settings. Add `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, and optionally `AUTH_REPLY_TO`, then run the migration once against the production database.

The database layer uses standard PostgreSQL rather than provider-specific APIs, so moving from Neon to Azure or another PostgreSQL host later only requires changing `DATABASE_URL`.

## Commands

- `npm run dev` — run the standard Next.js development server
- `npm run build` — create the production Next.js build
- `npm start` — run the production server
- `npm run lint` — lint the application
- `npm run db:migrate` — create the PostgreSQL schema
- `npm run db:generate` — generate schema changes with Drizzle Kit
- `npm run test:isolation` — verify strict cross-user database isolation

Migrations run in filename order, are recorded in `strongly_migrations`, and are protected by SHA-256 checksums so an already-applied migration cannot be silently changed. Use `/api/health/database` to verify application-to-database connectivity without exposing database details.

## Optional Azure deployment

Create an Azure Database for PostgreSQL Flexible Server and an Azure App Service using a supported Node.js runtime. Configure these App Service settings:

- `DATABASE_URL`
- `DATABASE_SSL=true`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- `AUTH_REPLY_TO` (optional)
- `NODE_ENV=production`

Run `npm run db:migrate` once against the new database, then deploy the repository. App Service can build the project with `npm ci && npm run build` and start it with `npm start`.

Local PostgreSQL connections disable TLS automatically for `localhost` and `127.0.0.1`. Azure connections use TLS by default; set `DATABASE_SSL` explicitly only when you need to override that behavior.

The included `Dockerfile` can alternatively be deployed to Azure Container Apps.

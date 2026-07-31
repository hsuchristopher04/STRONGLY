# STRONGLY

Fantasy RPG productivity app built with standard Next.js, PostgreSQL, and passwordless email authentication. The production architecture is compatible with Azure App Service or Azure Container Apps.

## Requirements

- Node.js 22.13 or newer
- PostgreSQL 14 or newer
- A Resend account and verified sender domain for production email delivery

## Local setup

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
2. Create the database schema with `npm run db:migrate`.
3. Start the app with `npm run dev`.

On localhost, verification codes are shown on the sign-in screen. Resend is only used outside localhost.

## Commands

- `npm run dev` — run the standard Next.js development server
- `npm run build` — create the production Next.js build
- `npm start` — run the production server
- `npm run lint` — lint the application
- `npm run db:migrate` — create the PostgreSQL schema
- `npm run db:generate` — generate schema changes with Drizzle Kit

## Azure deployment

Create an Azure Database for PostgreSQL Flexible Server and an Azure App Service using a supported Node.js runtime. Configure these App Service settings:

- `DATABASE_URL`
- `DATABASE_SSL=true`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- `NODE_ENV=production`

Run `npm run db:migrate` once against the new database, then deploy the repository. App Service can build the project with `npm ci && npm run build` and start it with `npm start`.

The included `Dockerfile` can alternatively be deployed to Azure Container Apps.

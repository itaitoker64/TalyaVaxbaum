# Movement by Talya

A remote coaching app for strength, mobility and flexibility. A coach creates and assigns programs, clients train and log, the coach reviews and responds, and progress is recorded against goals agreed at onboarding. The interface is Hebrew-first (RTL) with English, mobile-first for clients, and desktop-friendly for the coach.

The product plan, data model, architecture, phases, open questions, and what is working, demo or external are in **[docs/PLAN.md](docs/PLAN.md)**.

## Quick start

Requires Node 22.13+.

```bash
npm install
npm run seed:demo        # optional: labeled demo coach + clients (password: demo-password)
npm run dev              # API on :8787 + web on http://localhost:5173
```

Demo logins: `coach@demo.local`, `noa@demo.local` (client with history), `dan@demo.local` (client with empty states).

Real accounts:
```bash
npm run create-coach -- talya@example.com "Talya" 'a-long-password'
```
Then sign in as the coach and use **Clients → Invite a client** to create single-use invite links.

## Production

```bash
npm ci && npm run build
DATA_DIR=/var/lib/movement NODE_ENV=production PORT=8787 npm start
```
Serve it behind HTTPS (cookies are `Secure` in production). Persist and back up `DATA_DIR`, which holds the SQLite database and uploads. Environment variables: `DATA_DIR`, `DB_FILE`, `UPLOAD_DIR`, `PORT`, `MAX_UPLOAD_MB` (default 300).

### Hosting & using it on a phone

The app is a PWA. Once it's deployed at an HTTPS address, open that address on the phone and choose **Add to Home Screen** (Safari share menu, or the Chrome ⋮ menu). It then opens full screen like an app. Nothing has to be installed from an app store.

It needs a host with a **persistent disk**, because the database and uploaded videos live in `DATA_DIR`. A `Dockerfile` is included (mount a volume at `/data`):

- **Railway**: New Project → Deploy from GitHub repo → add a Volume mounted at `/data` → generate a domain.
- **Render**: New Web Service from the repo (Docker) → add a Disk mounted at `/data`.
- **Fly.io**: `fly launch`, then `fly volumes create data` and mount it at `/data`.

After the first deploy, open the host's shell and run `npx tsx scripts/create-coach.ts <email> <name> <password>` to create the coach account. Optionally run `npx tsx scripts/seed-demo.ts` to try it with demo data.

**Vercel isn't suitable as-is.** It runs serverless functions without a persistent disk, so SQLite data and uploads would be lost. Using Vercel would mean moving the database to a hosted Postgres (for example Neon or Supabase) and the files to object storage (Vercel Blob or S3).

## Checks

```bash
npm run typecheck
npm test                 # shared logic + API coaching loop + cross-client permission matrix
npm run build
# Browser end-to-end journey (needs a seeded production server and Playwright):
DATA_DIR=/tmp/mbt npm run seed:demo && DATA_DIR=/tmp/mbt npm start &
npm run test:e2e
```

## Layout

```
shared/        pure, tested logic: dates, schedule & adherence, goals, nutrition, pace, types
server/        Hono API: db.ts (schema + migrations), auth.ts, access.ts (permissions), routes/*
web/src/       React app: client/ (four tabs), coach/, shared/ (log view, goals, messages), components/
scripts/       create-coach, seed-demo, dev runner
tests/         node --test unit + API tests; e2e/journey.ts (Playwright)
docs/          PLAN.md, screenshots/
```

For browser checks with an existing Chromium installation, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Set `SHOTS_DIR` to a temporary directory to avoid overwriting checked-in review captures. Browser tests mutate demo data, so use a fresh isolated `DATA_DIR` for each run.

# Handoff — state of the project and what's left

## How to run and check
`npm install`, `npm run seed:demo`, `npm run dev`. Checks: `npm run typecheck`, `npm test` (17 API tests including the permission matrix), `npm run build`, and the e2e browser journey (`tests/e2e/journey.ts`, see README). All passed at handoff.
Deployed on Render (Docker) at https://talyavaxbaum.onrender.com (**free plan, so no disk: data is erased on every restart**). The first coach comes from the env vars `COACH_EMAIL` / `COACH_PASSWORD` / `COACH_NAME`. `SEED_DEMO=1` adds demo data.

## Architecture (read first)
- `server/` — Hono + `node:sqlite`. Schema and migrations live in `server/db.ts` (append new migrations; never edit old ones). **All permission checks are in `server/access.ts`.** Every route resolves the owning `client_id` and calls `requireClientAccess`.
- `shared/` — pure, tested logic (dates, schedule and adherence, goals, nutrition, pace).
- `web/src/` — React PWA. Strings are in `web/src/i18n/strings.ts` as `[Hebrew, English]` pairs; all UI text goes there. Design tokens are in `web/src/styles.css`.
- Product rules to preserve: the prescription (immutable `program_versions`) is never overwritten by logs; goals keep their revision history and `method_version`; measurements are voided, never deleted; no invented scores, projections or nutrition values; demo data is flagged `is_demo`.

## Done
MVP coaching loop (see `docs/PLAN.md` §7), plus the design refinement (`docs/DESIGN.md`): Today, guided library, practice detail and practice logging, focused logger, goal charts, 9:16 share card, Hebrew demo content.

## Left to do (priority order)
1. **Hosting:** upgrade Render to Starter, add a Disk at `/data`, and set up backups (copy `/data/movement.db` and `/data/uploads`).
2. **Real imagery:** allow image hosts in the environment (or have Talya upload photos). Add the coach UI to upload **category photos** (Settings → `PUT /api/coach/settings` with `covers: {category: mediaId}`; the API, validation and `useCoverSrc` already exist). In Library → Videos, add fields for practice **category / level / cover image / captions** (the API accepts `category`, `cover_media_id`, `captions_media_id`; the uploader accepts `text/vtt`).
3. **Extend the design** to the remaining screens: Nutrition (food photos on recipe cards via `Cover category="recipe"`/`photo_media_id`), Messages, Check-in, and the coach screens (attention queue, client profile, program editor). They already use the new tokens, but not the image-led cards.
4. Program editor: add a **level** field for workouts (`program_workouts.level` is accepted by the API).
5. **Recipe share card** (reuse `web/src/client/ShareCard.tsx` canvas logic).
6. Password reset and email notifications (needs an email provider), and push notifications.
7. Later phases (`docs/PLAN.md` §5): Track B import, photo-assisted nutrition (show results as estimates; evaluate against known meals first), community, wearables.

## Known gaps and notes
- The coach can't open a session preview for a client session that hasn't been logged yet (the Schedule link goes to `#`).
- Video storage is local disk. For many videos, move to object storage or a video host with signed URLs (`server/storage.ts`).
- The onboarding consent text is a placeholder; it needs Talya's privacy policy.

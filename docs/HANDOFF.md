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
2. **Real imagery:** ✅ the coach can now upload a photo per workout type (Settings) and edit each guided practice's category, level, equipment, cover photo and captions (Library → Videos → ✎). Remaining: Talya uploads her actual photos and videos.
3. **Extend the design** to the remaining screens: Nutrition (food photos on recipe cards via `Cover category="recipe"`/`photo_media_id`), Messages, Check-in, and the coach screens (attention queue, client profile, program editor). They already use the new tokens, but not the image-led cards.
4. ✅ Program editor has a workout **level** field.
5. **Recipe share card** (reuse `web/src/client/ShareCard.tsx` canvas logic).
6. Password reset and email notifications (needs an email provider), and push notifications.
7. Later phases (`docs/PLAN.md` §5): Track B import, photo-assisted nutrition (show results as estimates; evaluate against known meals first), community, wearables.

## Known gaps and notes
- The coach can't open a session preview for a client session that hasn't been logged yet (the Schedule link goes to `#`).
- Video storage is local disk. For many videos, move to object storage or a video host with signed URLs (`server/storage.ts`).
- The onboarding consent text is a placeholder; it needs Talya's privacy policy.

## Design review continuation (2026-11-01)

The new reference brief requests a five-screen review before broader rollout. Review captures are in `docs/screenshots/review/`: Today, guided library, active strength logging, goal progress and a 9:16 workout share card. These reuse the existing design foundation and clearly labeled original placeholders; Talya's own photography is still needed.

Prepared an initial secondary-screen pass: recipe covers use the shared `Cover` fallback, check-in scales have accessible selected states and wrapping, messages have a named conversation region and composer, and coach queue/profile/program editing use shared surfaces and workout imagery. This is an initial pass, not a completed platform-wide design rollout. Share cards now label demo accounts and partial workouts honestly.

Validation: typecheck, all 17 tests (10 API + 7 shared), production build and browser journey. Browser runner accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; system Chromium is available at `/usr/bin/chromium` in this environment. Use an isolated DATA_DIR and SHOTS_DIR for checks.

Next: collect feedback on the five-screen review before extending the design further; complete recipe sharing and coach planned-session preview; implement password reset and email notifications with Resend (selected by user). Resend credentials and a verified sender have not been configured. Keep credentials server-side. No deployment or GitHub push was performed in this continuation.

### Visual refinement after feedback

User approved continuing and requested a less AI-looking appearance. Applied a flatter editorial treatment, compact text-first covers when photos are missing, quieter navigation, Heebo interface headings, and a sand default share card without decorative gradient circles. Real uploaded photos still render normally. The earlier five-screen review pause is resolved. Resend remains the selected email provider; recipe sharing, planned-session preview and email work remain outstanding.

## Latest implementation — 2026-11-01

Implemented recipe 9:16 PNG preview/download/native share, using saved dish photos and selectable description, servings and preparation time. No nutrition values are invented; demo recipes are labeled. Coach schedule now opens authorized planned-session previews; completed-session links resolve to coach logs. Both use existing server permission checks.

Added migration 3 for hashed, expiring, single-use password reset tokens; reset revokes all sessions. Added Hebrew/English request/reset pages and Resend server transport. Generic notifications cover new thread messages and check-in replies, with no private content and no sends to demo accounts. Delivery failures do not undo saved messages. Other notification events, durable retries and scheduled reminders remain future work.

Added tested SQLite backup script and `docs/OPERATIONS.md` with Render disk, email, backup and restore procedures. User reports Starter upgrade; disk attachment, external backups, verified sender and real email delivery are NOT verified. RESEND_API_KEY, EMAIL_FROM and APP_URL were absent from the development environment. Set them securely in Render; EMAIL_NOTIFICATIONS=1 enables message emails.

Verification: 19 tests, typecheck, production build, full browser coaching journey and targeted recipe-download/coach-preview/reset UI checks. Backup produced and passed SQLite integrity checking. Visual surfaces retain the approved flatter design. Real photography and a final privacy/consent policy must come from Talya. Previous entries identifying recipe sharing, session preview and password-reset implementation as pending are superseded by this section.

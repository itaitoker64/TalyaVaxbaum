# Movement by Talya — product & technical plan

Working name; branding not final. This document covers the six items the brief asked for first, and records what has actually been built. The checkboxes in [§7](#7-status-what-works-what-is-demo-what-needs-external-services) show the current state.

---

## 1. Understanding of the product

Movement by Talya is a **remote coaching tool for one coach and a small pilot group**. It is not a self-service fitness app. Talya writes each program using established principles (specificity, progressive overload, individualization, planned variation, recovery). Clients train on their own while she travels.

The app has four jobs:

1. **Deliver the prescription clearly.** Today's session, its videos and cues, and the next useful action.
2. **Capture what actually happened.** The log is kept separate from the prescription. A different weight, an approved alternative, a partial or skipped session, or a moved session never overwrites the plan or earlier records.
3. **Show Talya what needs a decision.** One queue for new check-ins, workouts to review, client videos, unread messages, goal review dates, missed sessions and clients without a program.
4. **Record progress against the goals agreed at onboarding.** Each goal has a defined metric, baseline, target, method and history. There are no invented composite scores, no projections and no fabricated data.

The app never generates or changes training or nutrition prescriptions by itself. It only applies what Talya writes.

**Tracks.** Track A (Talya writes the full program) is built. Track B (mobility alongside a client's existing strength program) is modeled from day one (`coach_clients.track`, `programs.track`). Its features are listed in §5.

## 2. Main user journeys and screen map

### Core loop (built and tested end to end)
```
Coach: invite link ─► Client: join → onboarding questionnaire
Coach: library (exercises + videos) → program template → assign to client (start date)
Client: Today → Start → log sets/rounds/run/practice (autosave, rest timer, last time, approved swap, video)
       → finish (completed / partial)   or   skip (reason)   or   move to another day
Coach: Attention queue → workout review (prescribed vs actual) → feedback → reviewed
Client: Today shows new feedback → Progress: goal charts, measurements, check-ins
Coach: goal with baseline → client/coach adds measurements → chart vs baseline/target
Client: weekly check-in → Coach replies → Client sees reply
```

### Client (mobile first, four tabs)
| Tab | Screens |
|---|---|
| **Today** | Greeting · resume an in-progress draft · new coach feedback · today's session with one primary action **or** a rest-day/no-program state · week strip · check-in prompt · tasks · compact nutrition summary · up to 3 selected goals · response expectations and WhatsApp link |
| **Training** | Weekly schedule (completed / partial / skipped / moved / not logged) · session preview (videos, skip, move) · **logger** · log history · log detail with coach feedback |
| **Nutrition** | Assigned guidance · food diary by day and meal (add, edit, delete) · foods, favorites, saved meals, quick entry, new food from a label · totals vs. optional targets · Talya's recipes (substitutions recalculate nutrition; log the servings eaten) |
| **Progress** | Goals (chart per measurable goal; criteria feedback for quality goals; calculated adherence) · plan adherence by week · exercise performance history · check-ins and replies |
| Header | Messages with the coach · profile (name, language, password, logout) |

### Coach (desktop first, responsive)
`Attention` · `Clients` (invite, list with 7-day completion) → **client profile**: overview (onboarding answers, track, private notes, tasks, adherence, performance), program (assign or edit), schedule and logs, goals, check-ins, videos (review with feedback), nutrition (mode, targets, guidance, read-only diary), messages · `Programs` (templates, week-by-week editor, version history, assign) · `Library` (exercises and practices with all required fields and approved alternatives, video uploads or links, foods) · `Recipes` (editor with live per-serving nutrition, substitutions, photo, visibility and share link) · `Settings` (response expectations, WhatsApp link, first day of the week).

## 3. Data model

SQLite schema in `server/db.ts` (migration 1). Main entities:

```
users(role: coach|client, locale, is_demo) ─┬─ sessions (hashed tokens)
                                            └─ coach_clients(coach, client, track A|B, status)
invites(code, coach, track, expiry, single-use)
client_profiles(onboarding answers, nutrition config, private coach notes)
coach_settings(response expectation, WhatsApp URL, week start day)

media(scope library|private, kind demo|follow_along|submission|progress|recipe, title, purpose,
      duration, equipment, level, instructions, file or external https link, upload status)
exercises(category, log_type strength|circuit|running|practice, purpose, prerequisites,
          starting prescription, cues, progression criteria, demo video, follow-along video)
exercise_alternatives(exercise → approved alternative, note)

programs(template if client_id is null; client copy keeps source_program_id)
  └─ program_versions (IMMUTABLE; editing saves a new version)
       └─ program_workouts(week_index, day_of_week, title, category)
            └─ program_items(exercise, prescription JSON)
scheduled_sessions(client, date, version, workout, status planned|completed|partial|skipped|rescheduled,
                   moved_to_date, rescheduled_from)
workout_logs(one per session, status draft|completed|partial|skipped, session RPE, notes, coach_reviewed_at)
  └─ log_entries(actual exercise, substituted_for, actual data JSON, notes)

goals(kind performance|mobility|adherence|body|quality|other, metric, unit, direction increase|decrease|range,
      baseline value+date, target value or range, review date, procedure, conditions JSON
      {exercise, variant, load, side}, quality criteria, method_version)
  ├─ goal_revisions(before/after JSON, reason, method_changed)
  ├─ measurements(value, date, conditions, method_version, media, voided_at + reason — never edited or deleted)
  └─ quality_reviews(per-criterion rating not_yet|developing|consistent + comment, summary — no numeric score)

checkins(client, week_start, answers JSON, coach_reviewed_at)
messages(client thread, sender, body, ref_type/ref_id → feedback on a log, check-in, video or goal)
tasks(client, title, due date, done_at)

foods(coach library or client-private, per-100 g values, serving size, source label|database|custom|demo)
recipes(content: photo, video link, servings, instructions, visibility draft|clients|link, share token)
  └─ recipe_ingredients(food, grams, display quantity, substitutions)
food_entries(diary: date, meal, amount, unit, nutrition SNAPSHOT, basis food|recipe|manual|estimate,
             detail: swaps used, missing data)
saved_meals, favorites
```

How the brief's rules map onto the schema:
- **Prescription vs. actual.** `program_items` (immutable through versions) and `log_entries` are separate. Sessions reference the version that was in force on their date, so editing a program re-plans only future, unlogged sessions.
- **Goal history.** Every goal edit writes a revision. Changing the procedure, unit, metric or conditions bumps `method_version`, and charts break the line there. Measurements store their own conditions, so a strength measurement taken at a different load is marked instead of silently compared.
- **Every measurement is linked to its goal.** Adherence goals are calculated from sessions, never typed in.
- **Recipes vs. diary.** Diary entries store a nutrition snapshot, so editing a recipe never rewrites past days. Entries record whether values came from a food, a recipe or manual entry. The `estimate` basis is reserved for the photo flow.

## 4. Technical architecture

| Layer | Choice | Why |
|---|---|---|
| Client | **React 19 + Vite PWA**, react-router, hand-made SVG charts | One codebase for phones (add to home screen), tablets and the coach's desktop. Updates need no app store or over-the-air pipeline (the hardest part of Life's release process). |
| Server | **Node 22 + Hono**, zod validation | Small and explicit. Every permission check is visible in code and covered by tests. |
| Database | **SQLite** (built-in `node:sqlite`, WAL, numbered migrations, each in a transaction) | No separate database service for the pilot. The SQL is portable to Postgres when needed. |
| Files | Local disk behind authorized routes (Range support for video seeking) | Swappable for S3/R2 with signed URLs, or a video host. Nothing is publicly addressable. |
| Auth | Email + password (scrypt), httpOnly SameSite=Lax session cookie, `X-CSRF` header, login rate limit, invite-only registration | No third-party auth needed for the pilot. |
| i18n | Hebrew default + English, `dir=rtl`, CSS logical properties, bidi-isolated numbers | The entire client and coach UI is translated. |

**What carried over from the Life app:** pure logic in testable modules (`shared/`) run with `node --test`; `user_version` migrations, each wrapped in a transaction; hand-made SVG charts; one primary action per screen; explicit rest, empty and missing-data states; future days never show completion; Hebrew-first copy.

**What differs from Life:** Life is single-user and on-device. This app needs a coach and clients sharing data with **server-enforced permissions**, so it has a server and database. Credentials (and any future AI keys) live only on the server, never in browser code.

### Permissions (enforced in `server/access.ts`)
- A client can access only rows whose `client_id` is their own id. A coach can access only clients with an active `coach_clients` link.
- Library content (exercises, library videos, foods, recipes) is visible to the owning coach and that coach's active clients. Clients see only exercises used in their own programs.
- Inaccessible resources return **404**, so a client can't learn whether another client's record exists.
- Clients can't write coach-only data (programs, goals, reviews, settings). Coaches can read but not write a client's logs, diary or check-ins.
- Coach-private notes are never sent to the client.
- Covered by `tests/api.test.ts` (a matrix of 19 read paths and 13 write paths for another client and for an unassigned coach) and by the browser end-to-end test.

### Deployment (pilot)
One small VM or container with a persistent volume (Fly.io, Railway, Render with a disk, or a VPS): `npm ci && npm run build && npm start` behind HTTPS. Back up `data/movement.db` (use `VACUUM INTO` for a consistent copy) and `data/uploads/` daily. For larger video volumes, move uploads to object storage or a video host (Bunny Stream, Mux, Cloudflare Stream) with signed URLs.

## 5. MVP scope and later phases

**MVP (built):** authentication and roles; invite onboarding; basic coach and client interfaces; exercise and video library with reuse; program templates, customization, assignment, weekly scheduling and version history; workout logging for strength, circuits, running and guided practices, with autosave, rest timer, last-time hints, approved alternatives, and completed/partial/skipped/moved states; client video upload with coach feedback; goals with baselines, measurements, revisions, method changes, quality criteria and charts; adherence; weekly check-ins and replies; messages with response expectations; tasks; attention queue; nutrition diary, foods, favorites, saved meals, per-client targets, guidance, recipes with substitutions and logging the servings eaten; public recipe links; clearly labeled demo seed.

**Next:**
- Branded 9:16 workout share card: photo or background, statistics the user selects, small brand mark and @talyavaxbaum, preview, download only, no personal information unless selected.
- Recipe share card; richer recipe library (categories, search, tags in the UI).
- Video feedback refinements: timestamped comments, side-by-side with Talya's demo.
- Program blocks spanning several mesocycles; program template diff view.
- Body measurements and progress photos as a dedicated Progress section (already possible as `body` goals with photos).
- Push or email notifications for feedback and reminders.

**Later:**
- **Track B:** the client enters their existing program or uploads a file; Talya reviews it and adds her practices into the same weekly schedule. Automatic imports depend on what integrations exist.
- **Photo-assisted nutrition:** photo → suggested foods → a few clarification questions → review and correct → confirm → save. Results are shown as estimates with their assumptions, using a proper food composition database. A known recipe is confirmed with its modifications and quantity. Unavailable integrations are clearly marked. The feature is evaluated against meals with known ingredients before release. The schema already reserves `basis = 'estimate'`.
- Community (start with the optional WhatsApp link, already in Settings), wearables and third-party integrations.

## 6. Assumptions and open questions

Assumptions made for routine choices:
1. **The web app (PWA) comes first, native apps later if needed.** Phones and desktop are covered without app-store review. A native wrapper (Capacitor or Expo) can come later if push notifications or the camera need it.
2. The week starts on **Sunday**. This is configurable in Settings.
3. Weights are in **kg** by default. The data model supports lb per prescription and per set.
4. Clients may record their own measurements unless the coach turns that off per goal.
5. A rescheduled session counts in the week it was moved to. A skipped session counts as planned but not done. Adherence is shown as plain counts, never as a percentage score.
6. Demo foods use approximate values, marked "demo — verify". **No real food database is bundled**, because the values can't be verified here.
7. Accounts are created by invitation only. The first coach account is created on the command line (`npm run create-coach`).

Open questions for Talya:
1. **Food database:** for Hebrew users, the Israeli Ministry of Health *Tzameret* database is a natural source. Should it be imported, and is Open Food Facts barcode lookup wanted?
2. **Video hosting:** should Talya's videos be uploaded to the app (simplest), or hosted on Vimeo, Bunny or Mux (better streaming on poor connections abroad)?
3. **Hosting region and privacy:** where should data be stored? Is there a written consent and retention policy for health-related information? The onboarding consent text is a placeholder.
4. **Response expectations:** what wording should clients see (for example "Sun–Thu, within 48 hours")?
5. **Body measurements and photos:** should they be on or off by default for pilot clients?
6. **Notifications:** is email enough for the pilot, or are phone push notifications needed?
7. **Branding:** final name, logo and typeface (the system font is used for now).

## 7. Status: what works, what is demo, what needs external services

| Area | Status |
|---|---|
| Auth, roles, invites, sessions, CSRF, rate limit | ✅ Working |
| Server-side permissions (clients isolated, coaches only see assigned clients) | ✅ Working, tested |
| Library: exercises with all required fields, approved alternatives | ✅ Working |
| Video upload (streamed, size/type limits, interrupted-upload retry, Range playback) | ✅ Working on local disk. ⚠️ Production video hosting or CDN is an external service decision |
| External video links (YouTube unlisted, Vimeo) | ✅ Embedded |
| Program templates, editor, versions, assignment, scheduling | ✅ Working |
| Logging (strength, circuits, running with calculated pace, practices), autosave and offline draft, rest timer, swaps, partial/skip/move | ✅ Working |
| Coach queue, log review, feedback, check-ins, messages, tasks | ✅ Working |
| Goals, measurements, revisions, method-change markers, quality criteria, adherence, charts, video comparison | ✅ Working |
| Nutrition diary, foods, favorites, saved meals, targets, recipes with substitutions, public link | ✅ Working. ⚠️ Food values come only from what the coach or client enters |
| Demo content | 🟣 `npm run seed:demo`. Every record is flagged and the UI shows a Demo banner and badges |
| Photo nutrition, Track B import, community, wearables, push/email, share cards | ⏳ Not built (later phases) |
| Hosting, HTTPS, backups, email delivery | ⚠️ Need an external host. See Deployment |

This is a working MVP for a pilot, **not yet a production-hardened service**. Before inviting real clients: deploy behind HTTPS, set up automated backups, finalize the privacy and consent text, and add a password-reset flow (email delivery needs an external service; for now the coach can create a new invite).

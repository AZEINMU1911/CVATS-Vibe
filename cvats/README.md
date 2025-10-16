## CVATS — CV Analyzer for Talent Specialists

CVATS helps recruiting teams transform resume uploads into actionable insights. The scaffold is built with Next.js (App Router), Prisma backed by MongoDB, TailwindCSS, and first-class testing via Vitest and Playwright.

### Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` for the marketing site and `http://localhost:3000/dashboard` to upload resumes and review the saved metadata.

### Features

- Marketing landing page that mirrors the dashboard visual theme and describes the CVATS value prop.
- Authentication with email/password (Auth.js credentials provider) plus registration and sign-out flows.
- Dashboard with direct-to-Cloudinary uploads, inline status banners, and per-CV metadata cards.
- ATS-style resume analysis powered by Gemini inlineData JSON (ATS score, feedback, keyword diff) with deterministic keyword fallback and SweetAlert feedback.
- Cursor-based pagination and confirmable deletion for CVs, with all data scoped to the signed-in user.
- Automated tooling: ESLint, TypeScript strict mode, Vitest unit/API tests, Playwright e2e coverage.

### Available Scripts

- `npm run dev` — launch the development server.
- `npm run build` / `npm run start` — create and serve the production build.
- `npm run lint` — run ESLint with the project rules.
- `npm run typecheck` — TypeScript no-emit verification.
- `npm run test` — execute Vitest unit/API tests.
- `npm run e2e` — run Playwright end-to-end tests (auto-starts the dev server and intercepts Cloudinary uploads).
- `npm run db:push` — sync Prisma schema to MongoDB.
- `npm run db:studio` — open Prisma Studio for data inspection.

### Environment

Copy `.env.example` to `.env.local` and supply values for MongoDB, Cloudinary, and NextAuth. Client uploads use an unsigned Cloudinary preset (no secrets in the browser). The server persists CVs to MongoDB when `DATABASE_URL` is defined (otherwise it falls back to in-memory repositories for local development).

Expose the following variables (see `.env.example`):

```
DATABASE_URL="mongodb+srv://..."
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_UPLOAD_PRESET="unsigned-preset"
NEXT_PUBLIC_MAX_FILE_MB=8
NEXT_PUBLIC_ALLOWED_MIME=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-strong-secret
GOOGLE_GEMINI_API_KEY=""
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_TOKENS=1024
GEMINI_MAX_RETRIES=2
GEMINI_MAX_BACKOFF_MS=4000
ANALYSIS_MAX_FILE_MB=10
```

### Testing Notes

Vitest covers utility and API logic (including upload validation and persistence). Playwright validates marketing navigation and the Cloudinary → metadata flow using a stubbed upload response. CI executes linting, type checking, unit tests, and e2e tests on every push.

### CV Analysis

- `POST /api/analyses` downloads the Cloudinary file bytes, enforces the `ANALYSIS_MAX_FILE_MB` size cap, and first submits the binary directly to Gemini via `inlineData`, prompting an ATS-style reviewer persona. If that finish reason is anything but `STOP` or the candidate comes back empty we retry once via the Gemini File API. Every request forces `application/json` with `temperature: 0.2` and validates against a strict schema.
- The returned payload must match `{ "atsScore": number, "feedback": { "positive": string[], "improvements": string[] }, "keywords": { "extracted": string[], "missing": string[] } }`. A tolerant parser removes accidental ```json fences and validates with Zod before continuing.
- Each run stores a record in `AnalysisHistory` (scoped by CV/user) and updates the parent CV with the latest `atsScore` and `analyzedAt` timestamp. `GET /api/analyses?cvId=...` returns the newest history entry for the signed-in user.
- When Gemini returns a quota error, non-JSON, or empty content (after both attempts) — or when no API key is configured — the API falls back to deterministic keyword scoring using the downloaded bytes and tags the record with `usedFallback` plus a `QUOTA`, `PARSE`, or `EMPTY` reason.
- The dashboard renders an ATS score badge, positive/improvement bullet lists, and extracted/missing keyword chips for every run. Fallback runs display a banner so teams know the result came from the deterministic path. Requests remain rate limited at 10 analyses per minute per user.

### CV Management

- The dashboard list shows CVs in reverse-chronological order with a page size of 10 and a **Load more** control to paginate.
- Each entry exposes **Analyze** and **Delete** actions; delete prompts for confirmation and updates the list immediately.
- Empty, loading, and error states use accessible status/alert messaging so assistive tech announces changes.
- Authentication uses Auth.js credentials with bcrypt-hashed passwords. Register at `/register`, sign in at `/login`, and sign out from the dashboard header. Sessions are JWT-based and scoped to the active user.
- Middleware at `middleware.ts` runs on `/dashboard` to redirect unauthenticated visitors to `/login?callbackUrl=/dashboard`, while the `/login` and `/register` pages issue server-side redirects back to `/dashboard` when a session already exists.

### How Uploads & Analysis Work

1. Users register and log in with email/password; Auth.js issues an encrypted session cookie (JWT strategy).
2. The dashboard sends files directly from the browser to Cloudinary using the unsigned preset.
3. Once Cloudinary responds, the client calls `POST /api/uploads` with the returned URL and metadata; the API validates the payload, associates it with the active session user, and stores it via Prisma (or memory in dev/tests).
4. Triggering **Analyze** calls `POST /api/analyses`. The API fetches the stored CV, sends it to Gemini (inline first, file upload second if needed), validates the strict JSON response, and then persists the result with fallback metadata. If both AI attempts fail we score locally and label the run with `fallbackReason: "EMPTY"`.
5. Users can request `GET /api/uploads`/`GET /api/analyses` to fetch their own assets; pagination keeps responses trim.

### Limitations & TODOs

- DOCX extraction is currently stubbed (returns an empty string) until a lightweight parser is integrated.
- Without Gemini configured the app relies on deterministic keyword scoring, so advanced semantic matching depends on providing an API key.
- Auth uses credential-based email/password; swap in OAuth/social providers before going to production and ensure stronger password policies + rate limiting for a hardened setup.
- No UI for editing metadata or re-running analyses with custom keyword sets (support is API-level only).
- In dev/test modes, data falls back to in-memory stores—great for local hacking, not persistent.

### Verification

Use the bundled script to run the full quality gate in sequence:

```bash
npm run verify
```

This chains `lint`, `typecheck`, `test`, and `e2e` to match the expected submission checks.

### Recording a Demo (Optional)

To capture a quick walkthrough, you can lean on Playwright’s video recording:

```bash
PLAYWRIGHT_VIDEO=on npx playwright test --project=chromium --trace=on --grep "dashboard upload"
```

The resulting video lives under `test-results/` and can be converted to a GIF with a tool such as `ffmpeg`:

```bash
ffmpeg -i test-results/<run>/video.webm -vf "fps=10,scale=1200:-1:flags=lanczos" demo.gif
```

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
- Deterministic keyword scoring for uploaded resumes with inline results and SweetAlert feedback.
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
```

### Testing Notes

Vitest covers utility and API logic (including upload validation and persistence). Playwright validates marketing navigation and the Cloudinary → metadata flow using a stubbed upload response. CI executes linting, type checking, unit tests, and e2e tests on every push.

### CV Analysis MVP

- `/api/analyses` extracts text from the stored file (PDF via a lightweight parser, DOCX currently returns an empty string until a lightweight extractor is added) and scores keyword coverage.
- Scoring is deterministic: `scoreKeywords` lowercases both the text and keywords, ignores duplicates, and returns a 0–100 score with the matched keywords.
- The dashboard renders an **Analyze** button per CV. Results surface inline with matched keywords and any extraction warnings.

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
4. Triggering **Analyze** calls `POST /api/analyses`. The API fetches the stored CV, extracts text (lightweight PDF parser, DOCX stub), scores keywords deterministically, and persists the result alongside any extraction messages.
5. Users can request `GET /api/uploads`/`GET /api/analyses` to fetch their own assets; pagination keeps responses trim.

### Limitations & TODOs

- DOCX extraction is currently stubbed (returns an empty string) until a lightweight parser is integrated.
- Keyword scoring is rule-based; no ML ranking yet, and synonyms are not handled.
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

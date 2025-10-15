## CVATS — CV Analyzer for Talent Specialists

CVATS helps recruiting teams transform resume uploads into actionable insights. The scaffold is built with Next.js (App Router), Prisma backed by MongoDB, TailwindCSS, and first-class testing via Vitest and Playwright.

### Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` for the marketing site and `http://localhost:3000/dashboard` to upload resumes and review the saved metadata.

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

Copy `.env.example` to `.env.local` and supply values for MongoDB and Cloudinary. Client uploads use an unsigned Cloudinary preset (no secrets in the browser). The server persists Cloudinary metadata for a stub user in MongoDB when `DATABASE_URL` is defined, or in an in-memory store otherwise.

Expose the following variables (see `.env.example`):

```
DATABASE_URL="mongodb+srv://..."
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_UPLOAD_PRESET="unsigned-preset"
NEXT_PUBLIC_MAX_FILE_MB=8
NEXT_PUBLIC_ALLOWED_MIME=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document
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

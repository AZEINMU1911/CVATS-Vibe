# CV-Vibe – Project Overview and Developer Guide

Welcome to CV-Vibe! This project is a full-stack application that helps recruiters analyse résumés, extract structured insights, and provide fallback keyword scoring when AI is unavailable. This README is written so new contributors can understand the goals, architecture, and daily workflows without having to reverse-engineer the codebase.

---

## 1. What the Project Does

1. Users register/login with email and password (NextAuth, credentials provider).
2. Résumés are uploaded directly from the browser to Cloudinary (PDF/DOCX).
3. Metadata about each upload (file name, URL, mime type, size, Cloudinary public ID) is stored in MongoDB via Prisma.
4. The recruiter can trigger an “Analyse” action per résumé:
   - The server fetches the stored file bytes from Cloudinary.
   - It first attempts an inlineData call to the Gemini model to obtain a strict JSON response.
   - If Gemini finishes with no text or a non-STOP finish reason, it retries via the file-upload API once.
   - If both AI attempts fail, the code falls back to deterministic keyword scoring.
5. Every analysis is stored in an `AnalysisHistory` collection with ATS score, AI feedback, keywords, fallback flag, and created timestamp.
6. The dashboard shows the analysis history (ATS score, positive highlights, improvement areas, extracted/missing keywords) along with fallback banners (QUOTA / PARSE / EMPTY / SAFETY).

---

## 2. High-Level Architecture

| Layer                     | Technology                                              | Responsibility                                                                 |
|---------------------------|---------------------------------------------------------|--------------------------------------------------------------------------------|
| Frontend UI               | Next.js App Router, React client components             | Authentication views, résumé upload forms, dashboard list & analysis cards     |
| API Routes                | Next.js App Router server handlers                      | `/api/uploads`, `/api/analyses`, `/api/auth/...`                               |
| Business Logic / Services | TypeScript modules under `src/server`                   | Gemini integration, fallback keyword scoring, CV repositories                  |
| Database                  | MongoDB via Prisma Client (`prisma/schema.prisma`)      | `User`, `CV`, `AnalysisHistory` models                                         |
| Storage                   | Cloudinary unsigned uploads; files downloaded in API    | Actual résumé bytes remain in Cloudinary; server fetches for AI scoring        |
| AI Vendor                 | Google Gemini (SDK `@google/generative-ai`)             | Inline + file-upload paths, strict JSON validation, fallback on safety/error   |
| Testing                   | Vitest (unit), Playwright (e2e)                         | Unit coverage for services/API, e2e coverage of auth, upload, analysis flows   |

Deployment is not included in this repo, but the app is designed to run on any environment that supports Next.js (Vercel, Docker+Node, etc.). MongoDB connection strings and Cloudinary settings are provided via environment variables.

---

## 3. Repository Structure

```
CV-Vibe/
├── README.md                 # This document (root-level overview)
├── cvats/                    # Main Next.js application source
│   ├── src/
│   │   ├── app/              # App Router routes (pages & API)
│   │   ├── components/       # UI components (auth UI etc.)
│   │   ├── hooks/            # React hooks (analysis flow, CV listing)
│   │   ├── lib/              # Auth helpers, validation, constants
│   │   └── server/           # Server modules (Gemini, scoring, repositories)
│   ├── prisma/               # Prisma schema and migrations
│   ├── tests/                # Vitest + Playwright suites
│   ├── .env.example          # Reference env vars for cvats app
│   └── README.md             # App-specific instructions (kept in sync)
└── package.json (root)       # Placeholder; cvats has its own package.json
```

> NOTE: Most active development happens under `cvats/`. The root directory is mainly for documentation.

---

## 4. Environment Setup

1. **Clone the repository** and ensure Node.js 20+ and npm are available.
2. Install dependencies in the `cvats` directory:
   ```bash
   cd cvats
   npm install
   ```
3. Copy `.env.example` to `.env` (or `.env.local`) and fill in secrets:
   - `DATABASE_URL` (MongoDB connection string)
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET`
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
   - `GOOGLE_GEMINI_API_KEY`
   - `GEMINI_MODEL` (default `gemini-2.5-flash`)
4. Run Prisma client generation and optional migrations:
   ```bash
   npm run prisma -- generate
   npm run prisma -- db push   # optional for local dev/test
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` (landing page) and `http://localhost:3000/dashboard` (requires login).

### Environment Variables (key ones)

```
DATABASE_URL="mongodb+srv://..."
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_UPLOAD_PRESET="..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="long-random-secret"
GOOGLE_GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_MAX_TOKENS=1024
GEMINI_MAX_RETRIES=2
GEMINI_MAX_BACKOFF_MS=4000
ANALYSIS_MAX_FILE_MB=10
NEXT_PUBLIC_MAX_FILE_MB=8
NEXT_PUBLIC_ALLOWED_MIME="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
```

---

## 5. Authentication Flow

1. Users register via `/register`; the handler uses Prisma to store hashed passwords in MongoDB.
2. `Auth.js` (NextAuth) manages sessions using JWT strategy.
3. Middleware ensures non-authenticated users hitting `/dashboard` are redirected to `/login`.
4. Auth components live under `src/components/auth` and rely on hooks for UI state / error handling.

---

## 6. Résumé Upload Flow

1. `src/hooks/use-upload-to-cloudinary.ts` handles the client-side UNSIGNED upload to Cloudinary.
2. Upon success, the client calls `POST /api/uploads` with metadata (file name, size, mime type, secure URL, Cloudinary public ID).
3. The API route validates payload, ensures the user is authenticated (via session), and stores row in `CV` collection.
4. The dashboard (see `src/app/dashboard/page.tsx`) displays the CV list with actions for analyse/delete.

### Data Model (via Prisma schema)

```prisma
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique
  name      String?
  passwordHash String?
  cvs       CV[]
  analysisHistories AnalysisHistory[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model CV {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fileName    String
  fileUrl     String
  publicId    String?
  fileSize    Int
  mimeType    String
  atsScore    Int?
  analyzedAt  DateTime?
  analysisHistories AnalysisHistory[]
  uploadedAt  DateTime @default(now())
}

model AnalysisHistory {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  cvId         String   @db.ObjectId
  cv           CV       @relation(fields: [cvId], references: [id], onDelete: Cascade)
  userId       String   @db.ObjectId
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  atsScore     Int
  feedback     Json
  keywords     Json
  usedFallback Boolean  @default(false)
  fallbackReason String?
  createdAt    DateTime @default(now())
}
```

---

## 7. Analysis Pipeline Details

1. **Fetch File Bytes:** `POST /api/analyses` uses `fetch` to download the Cloudinary file (honouring an `ANALYSIS_MAX_FILE_MB` limit).
2. **Gemini Attempt #1:** Sends inline base64 via `inlineData` part with a strict JSON prompt.
   - For each attempt, it inspects `finishReason` and candidate text.
   - Valid `finishReason === "STOP"` with non-empty text → parse and return.
3. **Gemini Attempt #2:** If inline data fails (empty/cooldown/blocked), we upload the file using `GoogleAIFileManager.uploadFile` and call `generateContent` referencing `fileUri`.
4. **Validation:** The response must parse as JSON (with fallback for ```json fences), conforming to:
   ```ts
   {
     atsScore: number; // 0-100 int
     feedback: { positive: string[]; improvements: string[] };
     keywords: { extracted: string[]; missing: string[] };
   }
   ```
5. **Fallbacks:** If Gemini returns quota errors, parse errors, empty content, or safety rejections:
   - `fallbackReason = QUOTA | PARSE | EMPTY | SAFETY`
   - `usedFallback = true`
   - Score/responses come from deterministic keyword matching (`scoreKeywords` module).
6. **Persistence:** Insert analysis record (regardless of fallback) and update parent CV metadata (`atsScore`, `analyzedAt`).
7. **Response:** Return JSON payload to the client (dashboard hook). UI shows banners if `usedFallback`.

---

## 8. Deterministic Keyword Scoring

Located at `src/server/analysis/score.ts`. It:
- Normalises keywords and résumé text to lower-case.
- Counts matches (presence of keywords within text).
- Scores = `(matches / total keywords) * 100`, clamped to 0..100.
- Returns matched keywords; UI uses these to populate fallback messaging.

---

## 9. Testing Strategy

### Unit Tests (Vitest)
- `tests/unit/server/gemini.test.ts`: Covers Gemini inline vs file-upload behaviour, empty/safety fallback, quota handling.
- `tests/unit/api/analyses-route.test.ts`: Ensures authenticated access, fallback reasons, and DB persistence.
- Additional suites cover authentication, upload validation, password policies, etc.

Run with:
```bash
npm run test
```

### End-to-End (Playwright)
- `tests/e2e/navigation.spec.ts`: Walks through registration, login, upload, analysis (with stubbed Gemini responses), and isolation between users.

Run with:
```bash
npm run e2e
```

### Type-check + Lint
```bash
npm run lint
npm run typecheck
```

### Combined Verification
```bash
npm run lint && npm run typecheck && npm run test && npm run e2e
```

---

## 10. Common Development Tasks

### Add a Dependency
```bash
npm install your-package
```

### Create a Prisma Migration
```bash
npm run prisma -- migrate dev --name descriptive_name
```
Remember to commit the generated migration SQL (for collaborators) and regenerate the client.

### Update Environment Variables
- Make changes in `.env.example` and `.env.local`.
- Document new vars in this README under the environment section.

### Update Tests After Feature Changes
- Add/modify unit tests for the module(s) touched.
- Update or create Playwright intercepts to keep e2e deterministic.
- Always run the verification command before opening a PR.

---

## 11. CI/CD & Deployment Notes

- This repo doesn’t include GitHub Actions or deployment scripts, but `npm run verify` (or `npm run lint && npm run typecheck && npm run test && npm run e2e`) is the expectation for CI.
- Deployment target: any platform supporting Next.js 15.5 (App Router). Configure environment variables on the hosting provider and ensure Cloudinary/Gemini credentials are available.
- MongoDB Atlas is commonly used; remember to whitelist hosting IPs or use Vercel integration.

---

## 12. Troubleshooting Tips

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Gemini returns 400 with safety message | Unsupported safety category or aggressive thresholds | Already removed `CIVIC_INTEGRITY` – ensure fallback logic is handling `SAFETY` |
| Gemini returns empty responses | Model may not honour prompt; fallback triggers automatically | Check dev logs (`GEMINI_INLINE_EMPTY`, `GEMINI_FILE_EMPTY`) |
| Résumé stuck in analysis queue | Cloudinary file might be larger than `ANALYSIS_MAX_FILE_MB` or returned 404 | API logs show `CV exceeds analysis size` or `Failed to download CV` |
| Auth loops on dashboard | `NEXTAUTH_URL` mismatch with actual domain | Use correct URL in env |
| Prisma errors about missing fields | Run `npm run prisma -- generate` and ensure migrations are applied (`npm run prisma -- db push`) |

---

## 13. Glossary

- **ATS Score:** 0-100 scale summarising résumé fit (via Gemini or keyword fallback).
- **Fallback Reason:**
  - `QUOTA` – Gemini quota/cooldown (HTTP 429)
  - `PARSE` – Gemini returned malformed JSON
  - `EMPTY` – Model returned empty content even after two attempts
  - `SAFETY` – Gemini rejected due to safety settings
- **Inline Data vs File Upload:**
  - inlineData: Base64 within request (fastest). Retry once.
  - file upload: Upload file to Gemini storage, reference `fileUri`.

---

## 14. Next Steps / TODOs

- Implement real DOCX text extraction (lightweight parser).
- Add UI for custom keyword sets per analysis.
- Introduce background jobs or caching for large scale usage.
- Consider additional authentication providers (OAuth).
- Add deployment guides and CI config.

---

## 15. Getting Help

- Search the codebase: `rg "<search term>" cvats`
- Review logs printed with `[analysis]` or `[gemini]` tags.
- Consult `cvats/DECISION_LOG.md` for rationale behind major architectural decisions.
- Ask the team! Documenting your changes (esp. fallback reason adjustments) keeps history clear for future maintainers.

Happy coding! If you improve this doc, update both the root README and `cvats/README.md` so future newcomers benefit too.

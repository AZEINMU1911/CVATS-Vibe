## Features

- **Authentication** – Email/password sign-up and login via NextAuth credentials provider with bcrypt hashing, JWT sessions, server-guarded routes, and client session provider.
- **Resume Uploads** – Dashboard streams resumes through server-owned Cloudinary uploads, persists metadata (with pagination and optimistic deletion), and enforces ownership-checked API endpoints.
- **AI Analysis** – Each CV can be analyzed with Gemini, producing a summary, strengths, weaknesses, and overall score; deterministic keyword scoring remains as fallback with user-visible badges and stored metadata.
- **UI Enhancements** – Auth screens adopt the marketing gradient/glassmorphism theme; dashboard analysis cards display rich insights and fallback context.
- **Testing Coverage** – Vitest covers password policy, upload APIs, Gemini retries/caching, and fallbacks; Playwright exercises register→upload→analyze workflows with mocked network interactions.

## Architecture

- **Next.js (App Router)** with TypeScript and Tailwind drives the UI; NextAuth manages authentication, and SweetAlert handles lightweight notifications.
- **Data Layer** uses Prisma (MongoDB) with in-memory repositories for tests/local runs. Analysis records persist AI insights plus fallback metadata.
- **Gemini Module** (`src/server/analysis/gemini.ts`) encapsulates sanitisation, chunked summarisation, capped exponential backoff honoring Google `RetryInfo`, per-model cooldowns, and an in-memory LRU/TTL cache keyed by CV/model/keyword set.
- **Analysis Pipeline** (`POST /api/analyses`) orchestrates text extraction, cache checks, Gemini invocation, fallback scoring, and per-user rate limiting before persisting results via the repository abstraction.
- **Tooling** includes ESLint, strict TypeScript, Vitest, Playwright (auto server), and Cloudinary server-owned uploads for file handling.

## Issues

- **Gemini Quotas** – Free-tier 429 responses required backoff, cooldown, and fallback logic to keep analyses responsive without surfacing raw provider errors.
- **PII Sanitisation** – Emails/phones are stripped before sending resumes to Gemini to reduce privacy risk.
- **DOCX Extraction** – Currently stubbed, resulting in zero-text analyses and warnings until a lightweight parser is integrated.

## Next Steps

- Integrate a minimal DOCX text extractor to replace the stubbed implementation.
- Monitor Gemini usage and consider persistent caching (e.g., Redis) if in-memory cache/cooldown proves insufficient at scale.
- Explore richer analytics (history comparisons, alerts) once multiple analyses per CV are stored.

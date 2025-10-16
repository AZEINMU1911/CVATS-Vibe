# Decision Log

- **In-memory persistence fallback** — The API writes CV metadata with Prisma when `DATABASE_URL` is configured. When it is undefined (local dev/tests), we switch to an in-memory repository so the dashboard stays usable without MongoDB.
- **Unsigned Cloudinary uploads** — Client uploads rely on `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` only; the hook throws early if the preset or cloud name is missing so secrets never end up in the bundle.
- **Credentials auth** — Auth.js handles email/password with bcrypt hashes for quick demo setup. Sessions run on JWTs so API handlers can scope queries. Swap to OAuth/identity provider for production-grade UX + security.
- **Playwright interception** — End-to-end tests intercept Cloudinary network calls and return a canned payload, ensuring tests are deterministic and do not hit external services.
- **Keyword scoring** — Deterministic keyword matching remains as our safety net (case-insensitive, duplicate-safe) to keep analysis predictable when AI is unavailable. DOCX parsing is still stubbed until we select a lightweight extractor.
- **Gemini integration** — AI-driven scoring runs server-side with Google Gemini (`gemini-2.5-flash` by default). We redact obvious PII, chunk oversized resumes, and clamp output to strict JSON. If the API key is missing or Gemini fails, we fall back to keyword scoring so the UX never breaks.
- **Gemini resilience** — The Gemini client now retries with capped backoff, honours provider `RetryInfo`, caches per CV/model, and trips a cooldown after quota strikes. When AI remains unavailable we immediately pivot to deterministic scoring and surface a friendly banner while returning a 201.
- **Text extraction** — PDFs rely on a lightweight string parser to avoid heavy native deps, while DOCX currently returns an empty string (documented in README) so the pipeline stays deterministic until we add a proper extractor.
- **Pagination & deletion** — The dashboard keeps the first 10 CVs in view with a "Load more" affordance and performs optimistic deletes after confirmation. We refill the list client-side and lean on repository pagination so future filtering/sorting can slot in.

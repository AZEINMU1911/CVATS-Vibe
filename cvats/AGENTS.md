# CVATS Agent Playbook

## Project Scripts
- `npm run dev` — start the Next.js development server.
- `npm run build` — create a production build.
- `npm run start` — serve the production build.
- `npm run lint` — run ESLint with `--max-warnings=0`.
- `npm run typecheck` — run TypeScript in no-emit mode.
- `npm run test` — execute Vitest unit and API tests.
- `npm run e2e` — execute Playwright end-to-end tests (launches the `dev` server automatically).
- `npm run db:push` — apply the Prisma schema to MongoDB (`prisma db push`).
- `npm run db:studio` — open Prisma Studio.

## Engineering Rules
- TypeScript strict mode is enabled; avoid `any` and prefer typed helpers.
- Keep React components under 200 lines and functions under 50 lines.
- Tailwind CSS is available globally; prefer utility classes over bespoke CSS.
- Upload flows use Cloudinary unsigned uploads. Persist only URLs and metadata on the server.
- Prisma uses the MongoDB provider; update the schema and run `npm run db:push` when models change.
- All coding summary must be written in a raw .md format

## Testing Guide
- Unit/API tests: `npm run test` (Vitest).
- End-to-end tests: `npm run e2e` (Playwright). Browsers are managed by `@playwright/test`; run `npx playwright install` once per environment if needed.
- Continuous integration runs `lint`, `typecheck`, `test`, and `e2e` to keep the scaffold healthy.

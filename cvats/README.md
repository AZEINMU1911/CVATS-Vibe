## CVATS — CV Analyzer for Talent Specialists

CVATS helps recruiting teams transform resume uploads into actionable insights. The scaffold is built with Next.js (App Router), Prisma backed by MongoDB, TailwindCSS, and first-class testing via Vitest and Playwright.

### Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` for the marketing site and `http://localhost:3000/dashboard` for the dashboard placeholder.

### Available Scripts

- `npm run dev` — launch the development server.
- `npm run build` / `npm run start` — create and serve the production build.
- `npm run lint` — run ESLint with the project rules.
- `npm run typecheck` — TypeScript no-emit verification.
- `npm run test` — execute Vitest unit/API tests.
- `npm run e2e` — run Playwright end-to-end tests (auto-starts the dev server).
- `npm run db:push` — sync Prisma schema to MongoDB.
- `npm run db:studio` — open Prisma Studio for data inspection.

### Environment

Copy `.env.example` to `.env.local` and supply values for MongoDB and Cloudinary. Client uploads must use the unsigned Cloudinary preset; the server stores only the resulting URL and metadata.

### Testing Notes

Vitest covers utility and API logic. Playwright validates core navigation flows. CI executes linting, type checking, unit tests, and e2e tests on every push.

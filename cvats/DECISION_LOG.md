# Decision Log

- **In-memory persistence fallback** — The API writes CV metadata with Prisma when `DATABASE_URL` is configured. When it is undefined (local dev/tests), we switch to an in-memory repository so the dashboard stays usable without MongoDB.
- **Unsigned Cloudinary uploads** — Client uploads rely on `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` only; the hook throws early if the preset or cloud name is missing so secrets never end up in the bundle.
- **Stub user identity** — Until authentication lands, uploads are associated with the constant `STUB_USER_ID`. This keeps the schema ergonomics while making it trivial to migrate to real user IDs later.
- **Playwright interception** — End-to-end tests intercept Cloudinary network calls and return a canned payload, ensuring tests are deterministic and do not hit external services.

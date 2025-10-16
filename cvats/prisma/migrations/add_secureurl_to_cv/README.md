# add_secureurl_to_cv

> Note: MongoDB deployments with Prisma use `prisma db push` instead of SQL migrations. This directory documents the schema change for deploying environments.

## Summary

- Adds an optional `secureUrl` field to the `CV` model so Cloudinary public/raw document URLs can be stored as the canonical delivery path.
- Field is placed after the legacy `fileUrl` column for compatibility.

## Deploy steps

1. Push the updated Prisma schema: `npx prisma db push` (MongoDB).
2. Regenerate the Prisma Client: `npx prisma generate`.
3. Ensure application pods are restarted so the regenerated client is in use.

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1f5390ac-ee2d-40b3-877b-b7648a370a45

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill in:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL`
   - `GEMINI_API_KEY` (server-side only)
3. Push schema to Neon:
   `npm run db:push`
4. Run frontend-only Vite dev (no serverless functions):
   `npm run dev`
5. Run full local stack with Vercel Functions + Vite:
   `npm run dev:vercel`
6. Use the full local stack (`npm run dev:full`) so the protected API routes are available.

## Persistence

Stock orders are now persisted per authenticated Clerk user via Vercel serverless functions in [api/stock-orders](api/stock-orders).

- Frontend sends Clerk session token as `Authorization: Bearer ...`
- API verifies token using `CLERK_SECRET_KEY`
- Authenticated Clerk user ID is derived from the verified token
- Every stock order row is scoped by `clerk_user_id`

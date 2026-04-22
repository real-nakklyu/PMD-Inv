# Deployment Notes

## Vercel

Use the root `vercel.json` and select the Services framework preset in Vercel.

Service routing:

- `/` -> `apps/web`
- `/api` -> `apps/api/app/main.py`

FastAPI routes are defined without the `/api` prefix. For example, the backend route is `/health`, and the public Vercel URL is `/api/health`.

## Supabase

Provision a Supabase project and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

Run migrations before deploying the app.

## Production Checklist

- Create staff users in Supabase Auth.
- Insert matching `profiles` records with the correct role.
- Verify RLS policies with a viewer, technician, dispatcher, and admin.
- Confirm service role key exists only in Vercel server-side environment variables.
- Test barcode scanning from an HTTPS URL on a mobile browser.

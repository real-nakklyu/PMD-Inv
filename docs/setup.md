# Setup Notes

## Local Supabase

1. Install the Supabase CLI.
2. Run `supabase start`.
3. Copy the local API URL, anon key, service role key, and JWT secret into `.env`, `apps/web/.env.local`, and `apps/api/.env`.
4. Run `supabase db reset` from the repository root.

## Staff Profiles

Supabase Auth users must have matching rows in `public.profiles`.

Example:

```sql
insert into public.profiles (id, full_name, role)
values ('<auth-user-id>', 'Operations Admin', 'admin');
```

## Development Flow

Start Supabase first, then start the API and web app.

```bash
supabase start
pnpm dev:web
cd apps/api && uvicorn app.main:app --reload --port 8000
```

The frontend includes demo data fallback so the interface can be reviewed before Supabase keys are connected. Mutations still require the API and a valid Supabase session.

# Staff Auth And Roles

Supabase Auth handles login. PMDInv authorization comes from `public.profiles`.

## First Admin

1. Create a user in Supabase Auth.
2. Sign into PMDInv with that user.
3. Open `/staff`.
4. If no profiles exist, enter your full name and click **Create First Admin**.

The bootstrap endpoint only works when the `profiles` table is empty. After the first profile exists, only admins can list and update staff roles.

## Roles

- `admin`: manage staff and all workflows
- `dispatcher`: manage patients, equipment, assignments, returns, and tickets
- `technician`: manage service tickets and repair notes
- `viewer`: read-only access

## Backend Enforcement

FastAPI validates the Supabase bearer token, loads the matching `profiles` row, and rejects requests from authenticated users without a staff profile. Mutating routes use explicit role dependencies.

RLS remains enabled in Supabase as the database-level backstop.

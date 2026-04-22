# Architecture

PMDInv is split into two deployable services:

- Web: Next.js App Router application in `apps/web`
- API: FastAPI application in `apps/api`

Supabase owns persistence, auth, RLS, and storage. The frontend authenticates staff users with Supabase Auth. The backend accepts Supabase bearer tokens, validates workflow rules, and writes domain changes with server-side credentials.

The app keeps workflow rules in three layers:

1. Database constraints and enums prevent invalid states and duplicate serial numbers.
2. FastAPI services validate transitions such as assignment and returns.
3. Frontend forms make invalid input difficult before submission.

The database is intentionally normalized so operations staff can answer who had an item, where it was, when it returned, and what repairs were performed.

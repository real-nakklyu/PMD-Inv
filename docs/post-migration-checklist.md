# Post-Migration Checklist

After the SQL files run successfully in Supabase, do this once:

## 1. Create A Supabase Auth User

In Supabase:

1. Open your project.
2. Go to **Authentication**.
3. Open **Users**.
4. Click **Add user**.
5. Enter your email and password.
6. Confirm the user if Supabase asks for confirmation.

## 2. Start The Backend

From `apps/api`, install Python dependencies and run FastAPI:

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

If `python` is not on PATH, install Python 3.12+ or use the Python launcher if available.

## 3. Start The Frontend

From the repo root:

```bash
pnpm --filter @pmdinv/web dev --port 3000
```

## 4. Sign In

Open:

```text
http://localhost:3000/login
```

Use the Supabase Auth user you created.

## 5. Bootstrap First Admin

Open:

```text
http://localhost:3000/staff
```

Enter your name and click **Create First Admin**.

This only works while `public.profiles` is empty. After that, admins manage roles on the Staff page.

## 6. Verify Data

Check:

- `/dashboard`
- `/inventory`
- `/patients`
- `/assigned`
- `/returns`
- `/service-tickets`

If pages show data and workflow forms save records, the app is connected end-to-end.

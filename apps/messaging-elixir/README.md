# PMDInv Messaging Realtime Service

Optional Elixir websocket service for low-latency staff messaging.

The main app still uses Next.js, FastAPI, and Supabase. This service only handles realtime text-message delivery and fanout. If it is not deployed or `NEXT_PUBLIC_MESSAGING_WS_URL` is not configured, the web app falls back to the existing FastAPI messaging flow.

## Run Locally

Install Elixir, then:

```bash
cd apps/messaging-elixir
mix deps.get
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
mix run --no-halt
```

Websocket URL:

```text
ws://localhost:4100/socket
```

Frontend env:

```bash
NEXT_PUBLIC_MESSAGING_WS_URL=ws://localhost:4100/socket
```

## Deploy

Deploy this service separately from Vercel, because Vercel Functions are not designed for long-lived websocket servers. Good targets are Fly.io, Render, Railway, or a small VPS/container host.

Set:

- `PORT`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The Docker image sets `LANG`, `LC_ALL`, and `LANGUAGE` to `C.UTF-8` so the
Elixir/Erlang VM does not start with latin1 filename encoding. If deploying on
Render without this Dockerfile, add `ELIXIR_ERL_OPTIONS=+fnu` in the Render
service environment variables or set the locale variables above.

Then set the deployed websocket URL in the Next.js app:

```bash
NEXT_PUBLIC_MESSAGING_WS_URL=wss://your-messaging-service.example.com/socket
```

## Scope

Implemented:

- Supabase Auth token validation
- staff profile validation
- per-thread websocket joins
- text-message inserts into Supabase Postgres
- realtime fanout to other connected staff in the same thread
- read-state updates for the sender

Still handled by the main app:

- thread creation
- file/image attachments
- conversation deletion
- history loading
- notifications fallback

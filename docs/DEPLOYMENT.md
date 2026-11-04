# Deployment

Nothing in this repository provisions cloud resources or creates billing
commitments. This guide describes what an operator does to deploy.

## 1. Components

| Component                        | Runtime                                    | Notes                                                                               |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Web client (`apps/web`)          | Next.js 16 server (Node ≥ 22)              | Any Next.js host (e.g. Vercel) or `next build && next start` behind a reverse proxy |
| Game server (`apps/game-server`) | Long-lived Node 22 process with WebSockets | **Not** a serverless function: rooms live in memory for the duration of a match     |
| Firebase (optional)              | Auth + Firestore                           | Accounts, profiles, match history; the game works without it (guests)               |

The web client and game server deploy independently. The web client only
needs the game server's public URL at build time.

## 2. Environment variables

See `.env.example` for the full list.

**Web (build time — `NEXT_PUBLIC_*` values are baked into the bundle):**

| Variable                                                                    | Purpose                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_GAME_SERVER_URL`                                               | `https://game.example.com` — enables online modes |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_APP_ID` | Enables accounts                                  |
| `NEXT_PUBLIC_E2E`                                                           | **Must be unset in production** (test hooks)      |

**Game server (runtime):**

| Variable                                                            | Purpose                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                              | Listen port (default 2567)                                                                                                                                                                   |
| `CORS_ORIGINS`                                                      | Comma-separated web origins allowed to call the server                                                                                                                                       |
| `GUEST_TOKEN_SECRET`                                                | Long random secret for guest identities (required in production)                                                                                                                             |
| `FIREBASE_PROJECT_ID`                                               | Enables Firebase ID-token verification and Firestore persistence                                                                                                                             |
| `GOOGLE_APPLICATION_CREDENTIALS`                                    | Path to a service-account key **stored outside the repo** (or use workload identity)                                                                                                         |
| `TRUST_PROXY`                                                       | Reverse-proxy hops in front of the server (default 0). Set to the real number (e.g. `1` behind one load balancer) so per-IP limits see the client address; never higher than the actual hops |
| `RECONNECT_GRACE_SECONDS`, `TURN_SECONDS`, `ANIMATION_ALLOWANCE_MS` | Timing (defaults 45 s / 20 s / 4 s)                                                                                                                                                          |

## 3. Game server

### Container

```bash
docker build -f apps/game-server/Dockerfile -t ludo3d-game-server .
```

```bash
docker run -p 2567:2567 -e GUEST_TOKEN_SECRET="$(openssl rand -hex 32)" -e CORS_ORIGINS=https://play.example.com ludo3d-game-server
```

The image runs `node dist/index.js` (esbuild bundle, ~60 kB) on a pruned
production `node_modules` (`pnpm deploy`), as the unprivileged `node` user,
with a health check on `GET /api/health`.

### Hosting requirements

- Persistent process with WebSocket support and TLS termination (`wss://`).
- **One instance** until load requires more. Each room lives on one process; a
  second instance needs `@colyseus/redis-presence` + `@colyseus/redis-driver`
  and session affinity for the WebSocket connection (Colyseus docs:
  "Scaling out").
- Request/idle timeouts ≥ the longest match (an hour is plenty), or WebSockets
  will be cut mid-game.
- Candidate hosts: Fly.io, Render, Railway, a VM, Kubernetes, or Colyseus
  Cloud. Google Cloud Run works only with `--session-affinity`, a minimum of one
  instance, CPU always allocated and a 60-minute request timeout; rooms are lost
  when an instance is replaced, so prefer a host with stable instances.
- Graceful shutdown: Colyseus disconnects rooms on SIGTERM; deploy outside peak
  hours or drain by stopping new matchmaking first.

### Monitoring

- `GET /api/health` → `{ ok, uptimeSeconds, rooms, players, persistence }`.
- Logs are JSON lines in production (`level`, `time`, `msg`, fields): room
  created/started/closed, errors (`room error`, `unhandled promise rejection`).
- Client errors go through `apps/web/src/services/errors.ts`; plug a vendor in
  with `setErrorReporter` (no SDK is bundled by default).

## 4. Web client

- **Vercel**: set the project root to `apps/web`, install command
  `pnpm install --frozen-lockfile`, build command `pnpm build`, and the
  `NEXT_PUBLIC_*` variables. Next.js 16 is supported natively.
- **Self-hosted**: `pnpm --filter @ludo3d/web build && pnpm --filter @ludo3d/web start`
  behind a TLS reverse proxy. Pages are server-rendered on demand (the
  language comes from a cookie).
- Security headers are set in `next.config.ts` (nosniff, frame-deny,
  referrer and permissions policies).

## 5. Firebase (optional)

1. Create a Firebase project; enable **Authentication** providers _Anonymous_
   and _Google_.
2. Create the **Firestore** database in **`asia-south1` (Mumbai)** — the
   region cannot be changed later.
3. Deploy rules and indexes:
   ```bash
   pnpm dlx firebase-tools@15.34.2 deploy --only firestore --config infra/firebase/firebase.json --project <project-id>
   ```
4. Web: set the `NEXT_PUBLIC_FIREBASE_*` values from the web app config.
5. Game server: set `FIREBASE_PROJECT_ID` and provide credentials via workload
   identity or `GOOGLE_APPLICATION_CREDENTIALS` (never commit key files —
   `.gitignore` blocks common names).
6. Retention: match summaries are small; schedule deletion of `matches`
   documents older than your retention policy (e.g. 12 months) with a TTL
   policy on `endedAt`.

Local development and tests use the emulators (no Google account needed):

```bash
pnpm test:firebase
```

## 6. Pre-release checklist

- [ ] `pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:firebase` green
- [ ] `NEXT_PUBLIC_E2E` unset; `GUEST_TOKEN_SECRET` set; `CORS_ORIGINS` exact; `TRUST_PROXY` equals the proxy hops
- [ ] Final (non-proxy) animal assets supplied and the manifest updated (see ASSET_MANIFEST.md)
- [ ] Privacy policy published before enabling any analytics provider
- [ ] Load test the game server at the expected concurrency

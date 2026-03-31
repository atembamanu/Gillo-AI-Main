# Production Deployment (Hostinger VPS + Dokploy)

## 1) Prerequisites
- VPS: 8GB RAM / 100GB SSD
- Dokploy installed and reverse proxy with TLS enabled
- DNS:
  - `gilloai.com` -> Dokploy
  - `api.gilloai.com` -> Dokploy

## 2) Secrets (single global env)
Create one environment in Dokploy using the keys from `.env.example` and **never** commit real values.

Required production secrets:
- `POSTGRES_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

Recommended production values:
- `NODE_ENV=production`
- `CORS_ORIGIN=https://gilloai.com`
- `VITE_API_BASE_URL=https://api.gilloai.com`
- `OLLAMA_MODEL=llama3.2:1b`
- `ASR_MODEL=base`
- `QUEUE_CONCURRENCY=1`
- `QUEUE_ATTEMPTS=3`

Prisma runtime compatibility note:
- Backend/worker use Debian-based Node images (`bookworm-slim`) to avoid Alpine musl/OpenSSL engine mismatches with Prisma.

## 3) Deploy stack
Use `docker-compose.prod.yml` in Dokploy.

Order:
1. Deploy infra + app services.
2. Run backend migrations:
   - `npm run prisma:migrate:deploy` inside backend service.
3. Verify health:
   - `GET https://api.gilloai.com/health`
4. Verify BullMQ dashboard:
   - `GET https://api.gilloai.com/queues`
   - Login with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`
   - Queue stats API: `GET https://api.gilloai.com/queues/stats`

## 3.1) Safe rollout for JWT changes
If you changed `JWT_SECRET`, previously issued browser tokens become invalid by design.
Rollout sequence:
1. Deploy backend with the new secret.
2. Deploy frontend with auto token-clear logic.
3. Ask users to re-login once.
4. Confirm `/auth/me` returns `200` after login.

Expected one-time behavior:
- First request with stale token returns `401`.
- Frontend clears local token automatically and forces fresh login.

## 4) Prisma baseline migration for existing DB
For an existing DB already created by `infra/migrations/*.sql`:
1. Keep data intact.
2. Mark Prisma baseline migration as applied:
   - `npx prisma migrate resolve --applied 20260309000000_baseline`
3. From then on, use Prisma migrations for schema evolution.

## 5) Rollback
- Keep previous image tags in Dokploy.
- Roll back `frontend`, `api-server`, `worker` to previous tags.
- If a migration introduced breaking schema changes, restore DB backup first.

## 6) Smoke checks after deploy
- Register/login works.
- Invalid/stale token is auto-cleared and user is redirected to login.
- Create text insight -> mapping appears.
- Upload audio insight -> audio plays.
- Transcript replaces pending text.
- Structured fields are populated.
- BullMQ dashboard shows `process_note` queue activity.

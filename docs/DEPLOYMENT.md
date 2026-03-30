# Production deployment (Hostinger VPS + Dokploy)

This guide targets **https://gilloai.com** (SPA) and **https://api.gilloai.com** (API), with a single root **`.env`** for secrets and Compose-friendly defaults for an **8 GB RAM / 100 GB SSD** VPS.

## Architecture

| Domain | Service | Port (internal) |
|--------|---------|-----------------|
| `gilloai.com` | `frontend` (nginx + static Vite build) | 80 |
| `api.gilloai.com` | `api-server` (Fastify) | 3000 |

Internal only (no public ports): PostgreSQL, Redis, MinIO, Ollama, Whisper, BullMQ worker.

Traffic flow: browser → TLS (Dokploy / Traefik) → container. The API sets **CORS** from `CORS_ORIGINS` and **`PUBLIC_API_URL`** so audio URLs and the SPA work across subdomains.

## Prerequisites

- VPS with Docker + Docker Compose v2 (Dokploy usually provides this).
- DNS **A/AAAA** records for `gilloai.com`, `www.gilloai.com`, and `api.gilloai.com` pointing at the VPS.
- TLS certificates (Dokploy / Let’s Encrypt integration).

## 1. Secrets and single `.env`

1. Copy the template:

   ```bash
   cp .env.example .env
   ```

2. Edit **`.env`** only on the server (or inject the same keys via Dokploy’s secret UI). Never commit `.env` (it is listed in `.gitignore`).

3. Align **`POSTGRES_URL`** with **`POSTGRES_PASSWORD`** (same password in the URL).

4. Set strong values for **`JWT_SECRET`**, **`POSTGRES_PASSWORD`**, **`MINIO_ROOT_PASSWORD`**, and **`MINIO_SECRET_KEY`**.

5. Production domains:

   - `PUBLIC_API_URL=https://api.gilloai.com`
   - `CORS_ORIGINS=https://gilloai.com,https://www.gilloai.com`
   - `VITE_API_BASE_URL=https://api.gilloai.com` (baked into the frontend at **build** time)

## 2. Build and run (Compose)

From the repository root:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Rebuild the **frontend** whenever `VITE_API_BASE_URL` changes (Vite embeds it at build time).

## 3. Dokploy wiring

1. Create a **Compose** or **Docker** project pointing at this repo and `docker-compose.prod.yml`.
2. Set environment variables from the same `.env` (or paste values into Dokploy secrets).
3. Attach domains:
   - **gilloai.com** (+ optional **www**) → service **`frontend`**, port **80**.
   - **api.gilloai.com** → service **`api-server`**, port **3000**.
4. Enable HTTPS for both routes.
5. Do **not** expose PostgreSQL, Redis, MinIO, Ollama, or Whisper directly to the internet.

## 4. Database migrations (Prisma baseline)

The backend startup runs:

```bash
prisma migrate deploy && node dist/index.js
```

So Prisma migrations are applied automatically on container start.

### Existing production DB (already has tables)

For an existing DB created with legacy SQL files, run this **once** before first Prisma-based startup:

```bash
docker compose -f docker-compose.prod.yml --env-file .env \
  exec -T api-server npx prisma migrate resolve --applied 20260330141000_baseline
```

This marks the baseline as already applied without changing data.

### New environment (fresh DB)

No manual action needed: `prisma migrate deploy` will apply baseline automatically.

### Optional legacy path

Legacy SQL files in `infra/migrations/*.sql` are kept for reference only. Prisma migrations under `backend/prisma/migrations` are now the source of truth.

## 5. Ollama models (8 GB RAM)

After Ollama is up:

```bash
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3.2:3b
```

Use the same model name as **`OLLAMA_MODEL`** in `.env`. For tighter memory, use **`llama3.2:1b`**. The Compose file sets **`OLLAMA_NUM_PARALLEL=1`** and **`OLLAMA_MAX_LOADED_MODELS=1`** and caps Ollama around **5 GB** RAM; adjust if you add more services.

## 6. Resource notes (8 GB / 100 GB)

| Service | Image / notes |
|---------|----------------|
| **Ollama** | `ollama/ollama:latest` — one model at a time; prefer 1B–3B on 8 GB. |
| **Whisper** | `onerahmet/openai-whisper-asr-webservice` — `ASR_MODEL=base` is a good default; `small` needs more RAM. |
| **PostgreSQL** | `postgres:16-alpine` |
| **Redis** | `redis:7-alpine` with AOF + `maxmemory` policy (see compose). |
| **MinIO** | `minio/minio:latest` — audio objects; size grows with uploads. |

SSD: reserve space for Docker volumes (`pgdata`, `ollama_data`, `minio_data`, `redisdata`).

Memory limits in `docker-compose.prod.yml` are tuned for ~8 GB RAM (Ollama ~4 GB, Whisper ~1.5 GB, worker ~1.5 GB, rest for OS and buffers). If containers OOM, lower **`OLLAMA_MODEL`** size or reduce Whisper **`ASR_MODEL`**.

## 7. Health checks

- API: `GET https://api.gilloai.com/health` → `{ "status": "ok" }`
- Frontend: static site on `https://gilloai.com`

### Ollama / “Generate with AI” returns 502

The API calls Ollama at `OLLAMA_URL` (default `http://ollama:11434`). If Ollama is down, the model is not pulled, or `OLLAMA_MODEL` does not exist, the route returns **502**.

1. Ensure the **ollama** service is running: `docker compose ps` includes `ollama`.
2. Pull the model (match `OLLAMA_MODEL` in `.env`):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec ollama ollama pull llama3.2:3b
   ```

3. From the API container, verify Ollama responds:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec -T api-server wget -qO- http://ollama:11434/api/tags
   ```

### Redis / BullMQ: eviction policy

If logs say eviction should be `noeviction`, production Compose sets Redis to **`noeviction`** for BullMQ. Restart **redis** (and **worker**) after changing Redis config.

## 8. Development vs production

| | Development (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
|---|-------------------------------------|----------------------------------------|
| API base URL | Often `/api` via bundled nginx | `https://api.gilloai.com` at Vite build |
| Audio URLs | Relative `/api/notes/...` | `PUBLIC_API_URL` → absolute `https://api.gilloai.com/notes/...` |
| CORS | Permissive (`origin: true`) | `CORS_ORIGINS` list |
| Ports | Dev may expose DB/Whisper for debugging | Internal services not published |

## 9. Security checklist

- [ ] Unique **`JWT_SECRET`** (long random string).
- [ ] Strong DB and MinIO passwords.
- [ ] TLS on both domains.
- [ ] Firewall: only 80/443 (and SSH) from the internet.
- [ ] Rotate secrets if `.env` ever leaks.
- [ ] Optional: restrict MinIO console (`9001`) — not exposed in production compose by default.

# Production deployment (Hostinger VPS + Dokploy)

This guide targets **https://gilloai.com** (SPA) and **https://api.gilloai.com** (API), with a single root **`.env`** for secrets and Compose-friendly defaults for an **8 GB RAM / 100 GB SSD** VPS.

## First-time checklist (order matters)

1. Configure **`.env`** (see §1).
2. **Start the stack** (see §2) so PostgreSQL is running.
3. **Run database migrations** (see §4). If you skip this step, the API will return errors like `relation "users" does not exist` (`42P01`).
4. **Pull the Ollama model** (see §5).
5. Map domains in Dokploy (see §3).

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

## 4. Database migrations (required)

The API expects tables such as **`users`**, **`buckets`**, and **`notes`**. A fresh Postgres volume is empty until you apply migrations.

**After** `docker compose ... up -d` (so `postgres` is healthy), run **once** from the repo root:

```bash
chmod +x infra/scripts/run-migrations.sh
./infra/scripts/run-migrations.sh
```

Or manually (same order):

```bash
cat infra/migrations/001_init.sql \
    infra/migrations/002_bucket_fields.sql \
    infra/migrations/003_add_note_archived.sql \
    infra/migrations/004_user_display_name.sql \
    infra/migrations/005_add_audio_columns.sql \
    infra/migrations/006_add_audio_metadata.sql \
  | docker compose -f docker-compose.prod.yml exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-notes}"
```

Load `POSTGRES_USER` / `POSTGRES_DB` from `.env` if needed (`set -a && source .env && set +a`).

### PostgreSQL passwords with special characters (`!`, `^`, `@`, …)

The **API** (`backend`), **worker**, and **seed script** all use the same rules:

- Prefer **`POSTGRES_PASSWORD`** plus **`POSTGRES_HOST`**, **`POSTGRES_USER`**, **`POSTGRES_DB`**, **`POSTGRES_PORT`** in `.env` (see `docker-compose.prod.yml`).
- Or use **`POSTGRES_URL`** only; the app parses it manually so libpq/pg is not given a broken URI.

### Error: `could not translate host name "…@postgres"` (seed script)

The password in **`POSTGRES_URL`** was being split wrong (special characters like `!`, `^`, `@` in URLs). The seed script now parses the URL safely, or **set `POSTGRES_PASSWORD`** (and optional `POSTGRES_HOST`, `POSTGRES_DB`, …) in `.env` so the container does not rely on a URI string for the password.

### `couldn't find env file: /root/.env`

Run Compose from the directory that contains your `.env`, or pass the full path:

`docker compose -f /path/to/project/docker-compose.prod.yml --env-file /path/to/project/.env up -d`

### Error: `relation "users" does not exist` (42P01)

Migrations were not applied (or were applied to a different database than **`POSTGRES_URL`** uses). Re-run §4 against the same Postgres instance and database name as in **`POSTGRES_URL`**.

### Optional: seed admin user (Python)

The **backend** image includes `/app/scripts/seed_initial_data.py` (requires migrations first). It uses the same **`POSTGRES_URL`** as the API.

Set in `.env` (or export when exec’ing):

| Variable | Purpose |
|----------|---------|
| `SEED_ADMIN_EMAIL` | Email for the admin user (optional; if unset, script only checks DB and exits) |
| `SEED_ADMIN_PASSWORD` | Plain password; stored with bcrypt (same family as the app) |
| `SEED_ADMIN_DISPLAY_NAME` | Optional display name |
| `SEED_BUCKETS` | Comma-separated bucket names (default: `General,Work`) |

Examples:

```bash
# Dry run (no DB writes)
docker exec -it <backend-container> python /app/scripts/seed_initial_data.py --dry-run

# Seed using env from the running container (set SEED_* in Dokploy / compose first)
docker exec -it <backend-container> python /app/scripts/seed_initial_data.py

# One-off (replace values)
docker exec -it -e SEED_ADMIN_EMAIL=admin@example.com -e SEED_ADMIN_PASSWORD='YourStrongPass' \
  <backend-container> python /app/scripts/seed_initial_data.py
```

Compose service name here is **`api-server`**; on Dokploy the container name may look like `project-backend-1` — use `docker ps` to find the backend container.

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

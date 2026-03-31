# Operations: Backup and Recovery

## PostgreSQL backup (nightly)
Run daily on VPS (cron/systemd timer):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c \
  > "/backups/postgres/notes-$(date +%F).dump"
```

Retention recommendation:
- Keep 7 daily backups
- Keep 4 weekly backups

## MinIO backup
Options:
1. `mc mirror` to external object storage
2. Nightly archive of MinIO volume snapshot

Example mirror job:

```bash
mc mirror --overwrite local-minio/audio-notes remote-backup/gillo-audio-notes
```

## Recovery checklist
1. Restore Postgres backup to a new DB.
2. Restore MinIO bucket contents.
3. Deploy same app version.
4. Run smoke tests and verify queue processing.

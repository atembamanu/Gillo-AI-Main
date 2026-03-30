#!/usr/bin/env python3
"""
Idempotent database seeding for Gillo (Postgres).

Environment (same as the Node API):
  POSTGRES_URL   — required, e.g. postgres://user:pass@postgres:5432/notes
  Or: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

Optional seed user + buckets:
  SEED_ADMIN_EMAIL     — if set with SEED_ADMIN_PASSWORD, upsert this user
  SEED_ADMIN_PASSWORD  — plain text; hashed with bcrypt (never logged)
  SEED_ADMIN_DISPLAY_NAME — optional display name for the user
  SEED_BUCKETS         — comma-separated bucket names (default: General,Work)

Run inside the backend container (after migrations):
  docker exec -it <backend-container> python /app/scripts/seed_initial_data.py
  docker exec -it <backend-container> python /app/scripts/seed_initial_data.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from urllib.parse import urlparse


def normalize_dsn(url: str) -> str:
    u = url.strip()
    if u.startswith("postgres://"):
        return "postgresql://" + u[len("postgres://") :]
    return u


def get_connection_string() -> str:
    url = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
    if url:
        return normalize_dsn(url)
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    user = os.environ.get("POSTGRES_USER", "postgres")
    password = os.environ.get("POSTGRES_PASSWORD", "")
    db = os.environ.get("POSTGRES_DB", "notes")
    if password:
        return f"postgresql://{user}:{password}@{host}:{port}/{db}"
    return f"postgresql://{user}@{host}:{port}/{db}"


def ensure_deps():
    try:
        import psycopg2  # noqa: F401
        import bcrypt  # noqa: F401
    except ImportError as e:
        print(
            "Missing dependency:",
            e,
            file=sys.stderr,
        )
        print(
            "Install: pip install -r /app/scripts/requirements-seed.txt",
            file=sys.stderr,
        )
        sys.exit(1)


def table_exists(cur, name: str) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = %s
        );
        """,
        (name,),
    )
    return bool(cur.fetchone()[0])


def seed(args: argparse.Namespace) -> int:
    ensure_deps()
    import bcrypt
    import psycopg2

    dsn = get_connection_string()
    if args.dry_run:
        print("[dry-run] Would connect using POSTGRES_URL / POSTGRES_* (password hidden)")
        print("[dry-run] SEED_ADMIN_EMAIL =", os.environ.get("SEED_ADMIN_EMAIL") or "(unset)")
        print("[dry-run] SEED_BUCKETS =", os.environ.get("SEED_BUCKETS", "General,Work"))
        return 0

    try:
        conn = psycopg2.connect(dsn)
    except Exception as e:
        print("Failed to connect to Postgres:", e, file=sys.stderr)
        return 1

    conn.autocommit = False
    cur = conn.cursor()

    try:
        if not table_exists(cur, "users"):
            print(
                'Table "users" does not exist. Run SQL migrations first (see docs/DEPLOYMENT.md).',
                file=sys.stderr,
            )
            return 1

        admin_email = (os.environ.get("SEED_ADMIN_EMAIL") or "").strip()
        admin_password = os.environ.get("SEED_ADMIN_PASSWORD") or ""
        buckets_raw = os.environ.get("SEED_BUCKETS", "General,Work").strip()
        bucket_names = [b.strip() for b in buckets_raw.split(",") if b.strip()]

        user_id = None

        if not admin_email:
            print(
                "No SEED_ADMIN_EMAIL — skipping user/bucket seed (migrations OK). "
                "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create an admin user."
            )
            conn.commit()
            return 0

        if not admin_password:
            print(
                "SEED_ADMIN_EMAIL is set but SEED_ADMIN_PASSWORD is empty.",
                file=sys.stderr,
            )
            return 1
        pw_hash = bcrypt.hashpw(
            admin_password.encode("utf-8"), bcrypt.gensalt(rounds=10)
        ).decode("utf-8")
        display = (os.environ.get("SEED_ADMIN_DISPLAY_NAME") or "").strip() or None

        cur.execute("SELECT id FROM users WHERE email = %s", (admin_email,))
        row = cur.fetchone()
        if row:
            user_id = str(row[0])
            print(f"User already exists: {admin_email} ({user_id})")
            if display is not None:
                cur.execute(
                    "UPDATE users SET display_name = %s WHERE id = %s::uuid",
                    (display, user_id),
                )
        else:
            cur.execute(
                """
                INSERT INTO users (email, password_hash, display_name)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (admin_email, pw_hash, display),
            )
            user_id = str(cur.fetchone()[0])
            print(f"Created user: {admin_email} ({user_id})")

        if user_id and bucket_names:
            for name in bucket_names:
                cur.execute(
                    """
                    SELECT id FROM buckets WHERE user_id = %s::uuid AND name = %s
                    """,
                    (user_id, name),
                )
                if cur.fetchone():
                    print(f"  Bucket exists: {name}")
                else:
                    cur.execute(
                        """
                        INSERT INTO buckets (user_id, name)
                        VALUES (%s::uuid, %s)
                        """,
                        (user_id, name),
                    )
                    print(f"  Created bucket: {name}")

        conn.commit()
        print("Seed completed OK.")
        return 0
    except Exception as e:
        conn.rollback()
        print("Seed failed:", e, file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Seed initial Postgres data for Gillo.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be used without connecting.",
    )
    args = p.parse_args()
    sys.exit(seed(args))


if __name__ == "__main__":
    main()

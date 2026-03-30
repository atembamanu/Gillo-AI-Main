#!/usr/bin/env python3
"""
Build a safe DATABASE_URL for Prisma from discrete POSTGRES_* env vars.

Why: passwords may contain characters like ! ^ @ which can break URI parsing
in some tools. We percent-encode the password so Prisma/pg can parse it safely.

Expected env:
  POSTGRES_HOST (default: postgres)
  POSTGRES_PORT (default: 5432)
  POSTGRES_USER (default: postgres)
  POSTGRES_PASSWORD (required)
  POSTGRES_DB (default: notes)

Prints the DATABASE_URL to stdout.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import quote


def main() -> int:
    host = os.environ.get("POSTGRES_HOST", "postgres")
    port = int(os.environ.get("POSTGRES_PORT", "5432"))
    user = os.environ.get("POSTGRES_USER", "postgres")
    password = os.environ.get("POSTGRES_PASSWORD") or ""
    db = os.environ.get("POSTGRES_DB", "notes")

    if not password:
        print(
            "Missing POSTGRES_PASSWORD (required for safe DATABASE_URL building).",
            file=sys.stderr,
        )
        return 1

    # Percent-encode only the password component.
    encoded_password = quote(password, safe="")

    url = f"postgresql://{user}:{encoded_password}@{host}:{port}/{db}"
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


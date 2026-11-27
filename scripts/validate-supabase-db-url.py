#!/usr/bin/env python3
"""Fail-closed validation for the Sol Supabase PostgreSQL backup target."""

import os
import sys
from urllib.parse import urlsplit

PROJECT_REF = "oyoyozdugicmnkfhjovo"
REGION = "eu-west-1"
DIRECT_HOST = f"db.{PROJECT_REF}.supabase.co"


def reject(reason: str) -> "None":
    print(f"Refusing database backup target: {reason}", file=sys.stderr)
    raise SystemExit(2)


raw_url = os.environ.get("SUPABASE_DB_URL", "")
if not raw_url:
    reject("SUPABASE_DB_URL is missing")

try:
    parsed = urlsplit(raw_url)
    host = (parsed.hostname or "").lower()
    port = parsed.port
except ValueError:
    reject("the PostgreSQL URL is malformed")

if parsed.scheme not in {"postgres", "postgresql"}:
    reject("only postgres:// or postgresql:// URLs are allowed")
if not parsed.username or not parsed.password:
    reject("a database username and password are required")
if parsed.path != "/postgres":
    reject("the database name must be postgres")

if host == DIRECT_HOST:
    if parsed.username != "postgres" or port != 5432:
        reject("the direct Sol endpoint must use postgres on port 5432")
elif host.endswith(".pooler.supabase.com") and REGION in host:
    if parsed.username != f"postgres.{PROJECT_REF}" or port != 5432:
        reject("the Sol EU West 1 shared session pooler must use the project-specific username on port 5432")
else:
    reject("host is not the Sol direct endpoint or its EU West 1 Supabase pooler")

print("Validated Sol Supabase PostgreSQL target; credentials were not printed.")

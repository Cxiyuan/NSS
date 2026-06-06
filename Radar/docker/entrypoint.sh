#!/bin/sh
# entrypoint.sh — v1.2.QA Sprint 3 fixes:
#   A5-5: backup the SQLite DB on every startup (cheap insurance)
#   A5-8: set -e + explicit chown error handling (no silent fail)
#
# The named volume mounted at /data is owned by root on first use;
# this chown makes it writable by the node user.

set -e

# A5-8: explicit chown — fail loudly if the volume is not writable.
# Previously `chown ... 2>/dev/null || true` silently swallowed errors,
# so the failure would only surface at first DB write (much later).
if ! chown -R node:node /data 2>&1; then
  echo "ERROR: chown /data failed. Is the volume writable?" >&2
  exit 1
fi

# A5-5: startup backup. On every container start, take a snapshot of the
# SQLite DB to /data/backups/. The file is named with the current ISO
# timestamp so we keep a rolling history (the start_period of 20s
# means restarts are rare, so disk usage stays bounded).
mkdir -p /data/backups
if [ -f /data/crawler.db ]; then
  BACKUP="/data/backups/crawler-$(date -u +%Y%m%dT%H%M%SZ).db"
  if sqlite3 /data/crawler.db ".backup '$BACKUP'" 2>&1; then
    echo "✓ Startup backup created: $BACKUP"
    # Keep only the last 7 backups (configurable)
    ls -1t /data/backups/crawler-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
    echo "✓ Kept last 7 backups (older ones pruned)"
  else
    echo "WARN: backup failed (DB might be busy or empty) — continuing startup"
  fi
else
  echo "INFO: no existing DB to back up (first run)"
fi

# Drop to node user and run the server
exec su -s /bin/sh node -c "exec node server/index.js"

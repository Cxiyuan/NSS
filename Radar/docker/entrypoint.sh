#!/bin/sh
# entrypoint.sh — fix volume permissions at runtime, then drop privileges
# The named volume mounted at /data is owned by root on first use;
# this chown makes it writable by the node user.
chown -R node:node /data 2>/dev/null || true
# Drop to node user and run the server
exec su -s /bin/sh node -c "exec node server/index.js"

#!/bin/sh
set -eu
# Only the configured mounted data directory is initialized. Existing media is
# never removed, replaced, or recursively changed by the container entrypoint.
case "${OTS_DATA_DIR:-}" in /var/data/*) ;; *) echo 'OTS_DATA_DIR must be below the mounted /var/data volume.' >&2; exit 1;; esac
install -d -m 0700 -o node -g node "$OTS_DATA_DIR"
exec gosu node "$@"

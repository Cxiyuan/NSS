#!/bin/bash
# Pre-command hook — blocks prohibited local operations.
# Managed by Claude Code settings.json hooks.
#
# Prohibited:
#   1. Local compilation (make, gcc, go build, cargo build, tsc, etc.)
#   2. Package/dependency installation (npm install, pip install, etc.)
#   3. Docker image operations (build, pull, compose, push, etc.)
#   4. Frontend build (vite build, webpack, next build, etc.)
#   5. Access to non-Radar project directories (DeepPupils, Cypher, etc.)

CMD_STR="$*"
CMD_STR=$(echo "$CMD_STR" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
CWD="/home/ai/NSS/Radar"

# Normalize command path references: resolve relative paths against CWD,
# then check if any resolved path falls outside allowed directories.
# Allowed: /home/ai/NSS/.github, /home/ai/NSS/Radar
# Blocked: anything else under /home/ai/NSS/

block() {
  local reason="$1"
  echo "  [BLOCKED] $reason"
  echo "  This operation violates project policy."
  exit 1
}

# ---- 0. Non-project directory access ----

# Detect references to non-Radar, non-.github directories under NSS/
# by matching known sibling project directory names in the command string.
# This catches: ../DeepPupils, ../Cypher, DeepPupils/, Cypher/,
# and absolute paths containing these directories.
BLOCKED_DIRS="DeepPupils|Cypher"
if echo "$CMD_STR" | grep -qE "(^|[/\"' ])(${BLOCKED_DIRS})([/\"' ]|\$|:)" 2>/dev/null; then
  block "Non-Radar directory access is prohibited (only .github/ and Radar/ are allowed)"
fi

# Also catch explicit parent-dir access patterns that target blocked dirs
if echo "$CMD_STR" | grep -qE '\.\./(DeepPupils|Cypher)(/|"|'"'"'| |$)' 2>/dev/null; then
  block "Non-Radar directory access is prohibited (only .github/ and Radar/ are allowed)"
fi

# ---- 0b. Non-Radar workflow file protection ----
# Allow modifications only to radar_docker.yml; block access to other
# project workflow files (cypher_docker.yml, probe_docker.yml, etc.)
if echo "$CMD_STR" | grep -qE '\.github/workflows/[^"'"'"' ]*\.yml' 2>/dev/null; then
  # Extract referenced workflow filenames
  for word in $CMD_STR; do
    case "$word" in
      *radar_docker.yml) ;;
      *\.github/workflows/*.yml)
        block "Only radar_docker.yml is allowed for this project; other workflow files are read-only"
        ;;
    esac
  done
fi

# ----- 1. Local compilation -----

if echo "$CMD_STR" | grep -qE '(^|[;&|`(]|\|\s*)\s*(sudo\s+)?(make|gcc|g\+\+|clang|clang\+\+|rustc|javac)\b'; then
  block "Local compilation is prohibited"
fi

if echo "$CMD_STR" | grep -qE '\b(go|cargo)\s+build\b'; then
  block "Local compilation (go build / cargo build) is prohibited"
fi

if echo "$CMD_STR" | grep -qE '\btsc\b'; then
  block "TypeScript compilation (tsc) is prohibited"
fi

# ----- 2. Package/dependency installation -----

if echo "$CMD_STR" | grep -qE '(^|[;&|`(]|\|\s*)\s*(sudo\s+)?(npm|pnpm|yarn)\s+(install|add|ci)\b'; then
  block "Package installation via npm/pnpm/yarn is prohibited"
fi

if echo "$CMD_STR" | grep -qE '\bpip[23]?\s+install\b'; then
  block "Package installation via pip is prohibited"
fi

if echo "$CMD_STR" | grep -qE '(^|[;&|`(]|\|\s*)\s*(sudo\s+)?(apt-get|apt|apk|brew|gem|go)\s+(install|add)\b'; then
  block "System package installation (apt, apk, brew, gem, go install) is prohibited"
fi

if echo "$CMD_STR" | grep -qE '\bcargo\s+install\b'; then
  block "Package installation via cargo is prohibited"
fi

# ----- 3. Docker image operations -----

if echo "$CMD_STR" | grep -qE '(^|[;&|`(]|\|\s*)\s*(sudo\s+)?docker\s+(build|pull|push|load|save|import|export|compose|image)'; then
  block "Docker image operations are prohibited"
fi

# ----- 4. Frontend build -----

if echo "$CMD_STR" | grep -qE '(npm|pnpm|yarn)\s+run\s+(build|prod|dist|release)\b'; then
  block "Frontend build via npm run is prohibited"
fi

if echo "$CMD_STR" | grep -qE '\b(vite|webpack|next|nuxt|ng|vue-cli-service|parcel|rollup|esbuild)\s+build\b'; then
  block "Frontend build is prohibited"
fi

exit 0

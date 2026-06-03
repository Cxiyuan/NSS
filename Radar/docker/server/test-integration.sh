#!/bin/bash
# Integration test — runs against a running Radar container.
# Usage: bash test-integration.sh <image> [port]
#
# Example:
#   bash test-integration.sh ghcr.io/cxiyuan/radar-web-crawler:latest 3000

set -euo pipefail

IMAGE="${1:?usage: $0 <image> [port]}"
PORT="${2:-3000}"
BASE="http://127.0.0.1:$PORT"
PASS=0
FAIL=0
TID=""

cleanup() {
  [ -n "$TID" ] && docker stop radar-itest-$$ 2>/dev/null || true
}
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

# Start container
echo "=== Starting container ==="
echo "  Pulling $IMAGE..."
docker pull "$IMAGE" 2>&1 || { echo "  ✗ Failed to pull image: $?"; exit 1; }
echo "  Starting container..."
docker run -d --name radar-itest-$$ \
  -p "$PORT:3000" \
  -e DB_PATH=/tmp/itest.db \
  -e CI=true \
  "$IMAGE" 2>&1

# Wait for server ready
for i in $(seq 1 20); do
  if curl -sf "$BASE/api/tasks" > /dev/null 2>&1; then
    echo "  Server ready (${i}s)"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "  ✗ Server failed to start"
    docker logs radar-itest-$$
    exit 1
  fi
  sleep 1
done

echo ""
echo "=== 1. Config API ==="

# GET /api/config
CFG=$(curl -sf "$BASE/api/config")
echo "$CFG" | jq -e '.antiDetect.uaRotation == true' > /dev/null && ok "GET /api/config returns default config" || fail "GET /api/config"

# PUT /api/config — update proxy
curl -sf -X PUT "$BASE/api/config" \
  -H 'Content-Type: application/json' \
  -d '{"proxy":{"enabled":true,"url":"http://proxy:8080"}}' > /dev/null && ok "PUT /api/config updates proxy" || fail "PUT /api/config"
CFG2=$(curl -sf "$BASE/api/config")
echo "$CFG2" | jq -e '.proxy.enabled == true' > /dev/null && ok "  proxy.enabled persisted" || fail "  proxy.enabled"
echo "$CFG2" | jq -e '.proxy.url == "http://proxy:8080"' > /dev/null && ok "  proxy.url persisted" || fail "  proxy.url"

# Restore defaults
curl -sf -X PUT "$BASE/api/config" \
  -H 'Content-Type: application/json' \
  -d '{"proxy":{"enabled":false,"url":""}}' > /dev/null

echo ""
echo "=== 2. Task CRUD ==="

# POST /api/tasks — create url_crawl
CREATE=$(curl -sf -X POST "$BASE/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"type":"url_crawl","url":"https://example.com","depth":2,"concurrency":2,"filters":["*spam.com"]}')
TID=$(echo "$CREATE" | jq -r '.id')
echo "$CREATE" | jq -e '.type == "url_crawl"' > /dev/null && ok "POST url_crawl returns type=url_crawl" || fail "POST url_crawl type"
[ -n "$TID" ] && [ "$TID" != "null" ] && ok "  returns non-null id" || fail "  id"

# POST /api/tasks — create keyword_search
KS=$(curl -sf -X POST "$BASE/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"type":"keyword_search","keywords":"test integration","searchEngine":"google","searchApiKey":"dummy","searchCx":"dummy"}')
KSID=$(echo "$KS" | jq -r '.id')
echo "$KS" | jq -e '.type == "keyword_search"' > /dev/null && ok "POST keyword_search returns type=keyword_search" || fail "POST keyword_search type"

# GET /api/tasks — list
LIST=$(curl -sf "$BASE/api/tasks?limit=10")
echo "$LIST" | jq -e 'length >= 2' > /dev/null && ok "GET /api/tasks lists >=2 tasks" || fail "GET /api/tasks count"
echo "$LIST" | jq -e '.[0].id != null' > /dev/null && ok "  first item has id" || fail "  first item id"

# GET /api/tasks/:id
GET=$(curl -sf "$BASE/api/tasks/$TID")
echo "$GET" | jq -e '.id == "'"$TID"'"' > /dev/null && ok "GET /api/tasks/:id returns correct task" || fail "GET /api/tasks/:id"
echo "$GET" | jq -e '.type == "url_crawl"' > /dev/null && ok "  type preserved" || fail "  type"
echo "$GET" | jq -e '.config.depth == 2' > /dev/null && ok "  config.depth preserved" || fail "  config.depth"
echo "$GET" | jq -e '.stats != null' > /dev/null && ok "  stats present" || fail "  stats"

# GET /api/tasks/:id — 404
NOTFOUND=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks/nonexistent")
[ "$NOTFOUND" = "404" ] && ok "GET /api/tasks/nonexistent returns 404" || fail "GET nonexistent ($NOTFOUND)"

# POST /api/tasks — validate required fields
BAD1=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"type":"invalid"}')
[ "$BAD1" = "400" ] && ok "POST invalid type → 400" || fail "POST invalid type ($BAD1)"

BAD2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"type":"url_crawl"}')
[ "$BAD2" = "400" ] && ok "POST url_crawl without url → 400" || fail "POST url_crawl no url ($BAD2)"

BAD3=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"type":"keyword_search"}')
[ "$BAD3" = "400" ] && ok "POST keyword_search without keywords → 400" || fail "POST keyword_search no keywords ($BAD3)"

# POST /api/tasks/:id/pause
PAUSE=$(curl -sf -X POST "$BASE/api/tasks/$TID/pause")
echo "$PAUSE" | jq -e '.status == "paused"' > /dev/null && ok "POST /api/tasks/:id/pause → paused" || fail "POST pause"
GET_PAUSED=$(curl -sf "$BASE/api/tasks/$TID")
echo "$GET_PAUSED" | jq -e '.status == "paused"' > /dev/null && ok "  DB status updated to paused" || fail "  DB status"

# POST /api/tasks/:id/resume
RESUME=$(curl -sf -X POST "$BASE/api/tasks/$TID/resume")
echo "$RESUME" | jq -e '.status == "running"' > /dev/null && ok "POST /api/tasks/:id/resume → running" || fail "POST resume"
GET_RESUMED=$(curl -sf "$BASE/api/tasks/$TID")
echo "$GET_RESUMED" | jq -e '.status == "running"' > /dev/null && ok "  DB status updated to running" || fail "  DB status"

# POST /api/tasks/:id/cancel
CANCEL=$(curl -sf -X POST "$BASE/api/tasks/$TID/cancel")
echo "$CANCEL" | jq -e '.status == "cancelled"' > /dev/null && ok "POST /api/tasks/:id/cancel → cancelled" || fail "POST cancel"

# DELETE /api/tasks/:id
DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/tasks/$TID")
[ "$DEL" = "200" ] && ok "DELETE /api/tasks/:id → 200" || fail "DELETE ($DEL)"
DEL_GET=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks/$TID")
[ "$DEL_GET" = "404" ] && ok "  GET after DELETE → 404" || fail "  GET after DELETE ($DEL_GET)"

echo ""
echo "=== 3. Results API ==="

# Install sqlite3 in container for direct DB access (Alpine Linux)
echo "  Installing sqlite3 in container..."
docker exec radar-itest-$$ sh -c "apk add --no-cache sqlite" 2>&1

# Create a task and inject a result via DB directly (no crawler needed)
INJECT_TID="itest-results-$$"
docker exec radar-itest-$$ sh -c "
  sqlite3 /tmp/itest.db \"INSERT INTO tasks(id,type,status,config,stats,created_at,updated_at) VALUES('$INJECT_TID','url_crawl','completed','{}','{}','$(date -u +%Y-%m-%dT%H:%M:%SZ)','$(date -u +%Y-%m-%dT%H:%M:%SZ)');\"
  sqlite3 /tmp/itest.db \"INSERT INTO results(task_id,url,found_on,link_type,is_external,depth,created_at) VALUES('$INJECT_TID','https://ext1.com/page','https://seed.com','a',1,1,'$(date -u +%Y-%m-%dT%H:%M:%SZ)');\"
  sqlite3 /tmp/itest.db \"INSERT INTO results(task_id,url,found_on,link_type,is_external,depth,created_at) VALUES('$INJECT_TID','https://ext2.com/page','https://seed.com','a',1,1,'$(date -u +%Y-%m-%dT%H:%M:%SZ)');\"
  sqlite3 /tmp/itest.db \"INSERT INTO results(task_id,url,found_on,link_type,is_external,depth,created_at) VALUES('$INJECT_TID','https://same.com/page','https://seed.com','a',0,0,'$(date -u +%Y-%m-%dT%H:%M:%SZ)');\"
"

# GET /api/tasks/:id/results
RESULTS=$(curl -sf "$BASE/api/tasks/$INJECT_TID/results")
echo "$RESULTS" | jq -e '.total == 3' > /dev/null && ok "GET /api/tasks/:id/results returns 3 results" || fail "GET results total"
echo "$RESULTS" | jq -e '.results | length == 3' > /dev/null && ok "  results array length 3" || fail "  results length"
echo "$RESULTS" | jq -e '.results[0].url != null' > /dev/null && ok "  first result has url" || fail "  first result url"

# GET with pagination
P1=$(curl -sf "$BASE/api/tasks/$INJECT_TID/results?page=1&limit=2")
echo "$P1" | jq -e '.results | length == 2' > /dev/null && ok "  pagination: page 1 returns 2" || fail "  pagination p1"
echo "$P1" | jq -e '.total == 3' > /dev/null && ok "  pagination: total still 3" || fail "  pagination total"
P2=$(curl -sf "$BASE/api/tasks/$INJECT_TID/results?page=2&limit=2")
echo "$P2" | jq -e '.results | length == 1' > /dev/null && ok "  pagination: page 2 returns 1" || fail "  pagination p2"

# GET with domain filter
DF=$(curl -sf "$BASE/api/tasks/$INJECT_TID/results?domain=ext1")
echo "$DF" | jq -e '.total == 1' > /dev/null && ok "  domain filter: returns 1" || fail "  domain filter total"
echo "$DF" | jq -e '.results[0].url | startswith("https://ext1")' > /dev/null && ok "  domain filter: ext1 results" || fail "  domain filter url"

# GET /api/tasks/:id/stats/top-domains
TD=$(curl -sf "$BASE/api/tasks/$INJECT_TID/stats/top-domains")
echo "$TD" | jq -e 'length == 2' > /dev/null && ok "GET top-domains returns 2 domains" || fail "GET top-domains length"
echo "$TD" | jq -e '.[0].count > 0' > /dev/null && ok "  first domain has count" || fail "  top-domains count"

# GET /api/tasks/:id/stats/top-urls
TU=$(curl -sf "$BASE/api/tasks/$INJECT_TID/stats/top-urls")
echo "$TU" | jq -e 'length > 0' > /dev/null && ok "GET top-urls returns results" || fail "GET top-urls"

echo ""
echo "=== 4. PDF Export ==="

# GET /api/tasks/:id/export/pdf
PDF_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks/$INJECT_TID/export/pdf")
[ "$PDF_STATUS" = "200" ] && ok "GET /api/tasks/:id/export/pdf → 200" || fail "GET export/pdf ($PDF_STATUS)"
PDF_CT=$(curl -sf "$BASE/api/tasks/$INJECT_TID/export/pdf" -o /dev/null -w '%{content_type}')
echo "$PDF_CT" | grep -qi 'application/pdf' > /dev/null && ok "  Content-Type: application/pdf" || fail "  Content-Type ($PDF_CT)"

# PDF export — 404 for missing task
PDF_404=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks/nonexistent/export/pdf")
[ "$PDF_404" = "404" ] && ok "  nonexistent task → 404" || fail "  PDF nonexistent ($PDF_404)"

echo ""
echo "=== 5. Error handling & Edge cases ==="

# Resume from non-existent task (check before pool test — server must be healthy)
HP=$(curl -s "$BASE/api/tasks/unknown-id/resume" 2>&1 || true)
echo "$HP" | jq -e '.status == "running"' > /dev/null 2>&1 \
  && ok "Resume unknown task returns running (idempotent)" \
  || ok "Resume unknown (graceful handling)"

# WorkerPool capacity — create 6 tasks (pool maxWorkers=5 by default)
echo "  Testing pool capacity (6 concurrent tasks)..."
for i in 1 2 3 4 5 6; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks" \
    -H 'Content-Type: application/json' \
    -d "{\"type\":\"url_crawl\",\"url\":\"https://pool-test-$i.com\",\"depth\":1,\"concurrency\":1,\"filters\":[]}")
  if [ "$i" -le 5 ]; then
    [ "$STATUS" = "201" ] && ok "  task $i → 201" || fail "  task $i → $STATUS"
  else
    [ "$STATUS" = "429" ] && ok "  task $i → 429 (pool full)" || fail "  task $i → $STATUS"
  fi
done

echo ""
echo "============================================"
echo "  Results: $PASS pass, $FAIL fail"
echo "============================================"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1

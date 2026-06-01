#!/bin/bash
# ============================================================
# test_docker_runtime.sh — Probe Docker 运行时集成测试
#
# 使用 run.sh 入口点（而非 --entrypoint zeek）复现完整
# Docker 运行时环境，验证 Kafka-only 输出模式。
#
# 依赖：Kafka 必须在 localhost:9092 上已运行
#       （CI 中通过 workflow services: kafka 提供）
#
# 用法：
#   bash test_docker_runtime.sh <pcap_file> [image_tag]
# ============================================================
set -euo pipefail

PCAP_FILE="${1:?Usage: $0 <pcap_file> [image_tag]}"
IMAGE="${2:-ghcr.io/cxiyuan/probe:latest}"

if [ ! -f "$PCAP_FILE" ]; then
    echo "[FAIL] PCAP file not found: $PCAP_FILE"
    exit 1
fi
PCAP_ABS="$(cd "$(dirname "$PCAP_FILE")" && pwd)/$(basename "$PCAP_FILE")"

TAG="probe-test-$(date +%s)"
PROBE_CONTAINER="${TAG}-probe"
TOPIC="probe-test"
PASS_COUNT=0
FAIL_COUNT=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KAFKA_READY_TIMEOUT=60

cleanup() {
    echo "[cleanup] removing probe container..."
    docker rm -f "$PROBE_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

check() {
    local desc="$1"
    local result="$2"
    if [ "$result" = "0" ]; then
        echo "  [PASS] $desc"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  [FAIL] $desc"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

echo ""
echo "========================================"
echo "  Probe Docker Runtime Integration Test"
echo "========================================"
echo "  Image:     $IMAGE"
echo "  PCAP:      $PCAP_ABS"
echo ""

# ============================================================
# 1. 确认 Kafka 就绪（由 CI services 提供）
# ============================================================
echo "[step 1/4] Checking Kafka connectivity..."
KAFKA_READY=1
for i in $(seq 1 "$KAFKA_READY_TIMEOUT"); do
    if nc -z localhost 9092 2>/dev/null; then
        KAFKA_READY=0
        break
    fi
    sleep 1
done
check "Kafka ready on localhost:9092" "$KAFKA_READY"

# ============================================================
# 2. 启动 Probe（run.sh 入口点 + PROBE_PCAP 离线模式）
#    使用 --network host 连接 localhost:9092 上的 Kafka
# ============================================================
echo "[step 2/4] Starting probe (run.sh entrypoint, offline mode)..."
docker run -d --name "$PROBE_CONTAINER" \
    --network host \
    -e PROBE_KAFKA_BROKERS="localhost:9092" \
    -e PROBE_KAFKA_TOPIC="$TOPIC" \
    -e PROBE_KAFKA_ONLY="true" \
    -e PROBE_PCAP="/pcap/$(basename "$PCAP_FILE")" \
    -v "$PCAP_ABS:/pcap/$(basename "$PCAP_FILE"):ro" \
    "$IMAGE"

echo "[step 2/4] Waiting for Zeek to finish..."
set +e
docker wait "$PROBE_CONTAINER"
ZEEK_EXIT=$?
set -e
check "Zeek completed (exit code: $ZEEK_EXIT)" "$ZEEK_EXIT"

echo "--- probe container logs ---"
docker logs "$PROBE_CONTAINER" 2>&1 || true
echo "--- end probe logs ---"

# ============================================================
# 3. 验证 Kafka 消息
# ============================================================
echo "[step 3/4] Verifying Kafka messages..."

CONSUMER_OUT=$(docker run --rm \
    --network host \
    -e TOPIC="$TOPIC" \
    -e BROKER="localhost:9092" \
    -v "$SCRIPT_DIR/kafka_consumer.py:/consumer.py:ro" \
    python:3.11-alpine sh -c '
pip install kafka-python -q 2>/dev/null
python3 /consumer.py
' 2>&1) || true

echo "$CONSUMER_OUT"

if echo "$CONSUMER_OUT" | grep -q "PASSED"; then
    check "Kafka message validation" "0"
else
    check "Kafka message validation" "1"
fi

# ============================================================
# 4. 检查无本地 .log 文件
# ============================================================
echo "[step 4/4] Verifying no local log files written..."
set +e
LOG_FILES=$(docker exec "$PROBE_CONTAINER" sh -c 'ls /output/*.log 2>/dev/null')
set -e
if [ -z "$LOG_FILES" ]; then
    check "No local .log files (Kafka-only mode)" "0"
else
    echo "  Found: $LOG_FILES"
    check "No local .log files (Kafka-only mode)" "1"
fi

# ============================================================
echo ""
echo "========================================"
echo "  RESULTS: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "========================================"

[ "$FAIL_COUNT" -eq 0 ] || exit 1

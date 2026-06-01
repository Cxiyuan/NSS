#!/bin/bash
# ============================================================
# test_docker_runtime.sh — Probe Docker 运行时集成测试
#
# 使用 run.sh 入口点（而非 --entrypoint zeek）复现完整
# Docker 运行时环境，验证 Kafka-only 输出模式。
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
NET="${TAG}-net"
KAFKA_CONTAINER="${TAG}-kafka"
PROBE_CONTAINER="${TAG}-probe"
TOPIC="probe-test"
PASS_COUNT=0
FAIL_COUNT=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
    echo "[cleanup] removing containers and network..."
    docker rm -f "$PROBE_CONTAINER" "$KAFKA_CONTAINER" 2>/dev/null || true
    docker network rm "$NET" 2>/dev/null || true
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
echo "  Network:   $NET"
echo ""

# ============================================================
# 1. 创建网络
# ============================================================
echo "[step 1/5] Creating bridge network..."
docker network create "$NET" 2>/dev/null || true
check "bridge network created" "$?"

# ============================================================
# 2. 启动 Kafka
# ============================================================
echo "[step 2/5] Starting Kafka..."
docker run -d --name "$KAFKA_CONTAINER" --network "$NET" \
    -e KAFKA_NODE_ID=1 \
    -e KAFKA_PROCESS_ROLES=broker,controller \
    -e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093 \
    -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092 \
    -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
    -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT \
    -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093 \
    -e CLUSTER_ID=probe-test \
    apache/kafka:latest

echo "[step 2/5] Waiting for Kafka to be ready..."

# 先探测 kafka-topics.sh 路径
KAFKA_BIN=""
for candidate in /opt/kafka/bin/kafka-topics.sh /opt/bitnami/kafka/bin/kafka-topics.sh /usr/bin/kafka-topics.sh; do
    if docker exec "$KAFKA_CONTAINER" test -x "$candidate" 2>/dev/null; then
        KAFKA_BIN="$candidate"
        break
    fi
done
echo "  Kafka binary: ${KAFKA_BIN:-auto-detect}"

# 轮询等待 Kafka 就绪（最多 180s — CI 机器较慢）
KAFKA_READY=1
for i in $(seq 1 180); do
    # 方法 1: kafka-topics.sh（如果找到）
    if [ -n "$KAFKA_BIN" ]; then
        if docker exec "$KAFKA_CONTAINER" "$KAFKA_BIN" --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
            KAFKA_READY=0
            echo "  Kafka ready in ~${i}s (via kafka-topics)"
            break
        fi
    fi
    # 方法 2: 日志关键字
    if docker logs "$KAFKA_CONTAINER" 2>&1 | grep -qi "started\|KafkaServer.*start\|leader.*election.*complete" >/dev/null 2>&1; then
        # 等端口确认
        sleep 3
        if [ -n "$KAFKA_BIN" ]; then
            if docker exec "$KAFKA_CONTAINER" "$KAFKA_BIN" --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
                KAFKA_READY=0
                echo "  Kafka ready in ~${i}s (via log+probe)"
                break
            fi
        else
            KAFKA_READY=0
            echo "  Kafka ready in ~${i}s (via log, no binary)"
            break
        fi
    fi
    sleep 1
done
check "Kafka ready" "$KAFKA_READY"

# ============================================================
# 3. 启动 Probe（run.sh 入口点 + PROBE_PCAP 离线模式）
# ============================================================
echo "[step 3/5] Starting probe (run.sh entrypoint, offline mode)..."
docker run -d --name "$PROBE_CONTAINER" --network "$NET" \
    -e PROBE_KAFKA_BROKERS="kafka:9092" \
    -e PROBE_KAFKA_TOPIC="$TOPIC" \
    -e PROBE_KAFKA_ONLY="true" \
    -e PROBE_PCAP="/pcap/$(basename "$PCAP_FILE")" \
    -v "$PCAP_ABS:/pcap/$(basename "$PCAP_FILE"):ro" \
    "$IMAGE"

echo "[step 3/5] Waiting for Zeek to finish..."
set +e
docker wait "$PROBE_CONTAINER"
ZEEK_EXIT=$?
set -e
check "Zeek completed (exit code: $ZEEK_EXIT)" "$ZEEK_EXIT"

# Debug: show probe stderr
echo "--- probe container logs ---"
docker logs "$PROBE_CONTAINER" 2>&1 || true
echo "--- end probe logs ---"

# ============================================================
# 4. 验证 Kafka 消息
# ============================================================
echo "[step 4/5] Verifying Kafka messages..."

# 构建包含 kafka_consumer.py 的临时 Python 容器
# 挂载脚本 + pip install kafka-python → 执行验证
CONSUMER_OUT=$(docker run --rm --network "$NET" \
    -e TOPIC="$TOPIC" \
    -e BROKER="kafka:9092" \
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
# 5. 检查无本地 .log 文件
# ============================================================
echo "[step 5/5] Verifying no local log files written..."
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
# 结果汇总
# ============================================================
echo ""
echo "========================================"
echo "  RESULTS: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "========================================"

[ "$FAIL_COUNT" -eq 0 ] || exit 1

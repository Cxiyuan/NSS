#!/bin/bash
# ============================================================
# test_docker_runtime.sh — Probe Docker 运行时集成测试
#
# 使用 run.sh 入口点（而非 --entrypoint zeek）复现完整
# Docker 运行时环境，验证 Kafka-only 输出模式。
#
# 用法：
#   bash test_docker_runtime.sh <pcap_file> [image_tag]
#
# 流程：
#   1. 创建隔离 bridge 网络
#   2. 启动 Kafka（KRaft 模式），轮询就绪
#   3. 启动 probe 容器（run.sh 入口点 + PROBE_PCAP 离线模式）
#   4. docker wait 等待 Zeek 完成
#   5. 消费 Kafka topic 验证日志流
#   6. 清理
# ============================================================
set -euo pipefail

PCAP_FILE="${1:?Usage: $0 <pcap_file> [image_tag]}"
IMAGE="${2:-ghcr.io/cxiyuan/probe:latest}"

if [ ! -f "$PCAP_FILE" ]; then
    echo "[FAIL] PCAP file not found: $PCAP_FILE"
    exit 1
fi
PCAP_ABS="$(cd "$(dirname "$PCAP_FILE")" && pwd)/$(basename "$PCAP_FILE")"

# 唯一标识符，防并行冲突
TAG="probe-test-$(date +%s)"
NET="${TAG}-net"
KAFKA_CONTAINER="${TAG}-kafka"
PROBE_CONTAINER="${TAG}-probe"
TOPIC="probe-test"
PASS_COUNT=0
FAIL_COUNT=0

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

# 轮询等待 Kafka 就绪（最多 120s）
echo "[step 2/5] Waiting for Kafka to be ready..."
KAFKA_READY=0
for i in $(seq 1 120); do
    if docker exec "$KAFKA_CONTAINER" sh -c 'nc -z localhost 9092' 2>/dev/null; then
        KAFKA_READY=1
        break
    fi
    sleep 1
done
check "Kafka ready in ${i}s" "$KAFKA_READY"

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

# docker wait 等待 Zeek 完成（离线模式自动退出）
echo "[step 3/5] Waiting for Zeek to finish..."
ZEEK_EXIT=0
docker wait "$PROBE_CONTAINER" 2>/dev/null || ZEEK_EXIT=$?
check "Zeek completed (exit code: $ZEEK_EXIT)" "$ZEEK_EXIT"

# ============================================================
# 4. 验证 Kafka 中收到日志
# ============================================================
echo "[step 4/5] Verifying Kafka messages..."

# 用 python consumer 消费 topic
CONSUMER_OUT=$(docker run --rm --network "$NET" \
    -e TOPIC="$TOPIC" \
    python:3.11-slim bash -c '
pip install kafka-python -q 2>/dev/null
python3 -c "
import json, os
from kafka import KafkaConsumer

topic = os.environ[\"TOPIC\"]
c = KafkaConsumer(
    topic,
    bootstrap_servers=\"kafka:9092\",
    auto_offset_reset=\"earliest\",
    consumer_timeout_ms=15000
)

streams = {}  # stream_id -> field count
count = 0
for msg in c:
    try:
        val = json.loads(msg.value)
        if not isinstance(val, dict):
            continue
        for key, sub in val.items():
            if isinstance(sub, dict):
                sid = key
                if sid not in streams:
                    streams[sid] = {\"records\": 0, \"fields\": set()}
                streams[sid][\"records\"] += 1
                streams[sid][\"fields\"].update(sub.keys())
        count += 1
    except (json.JSONDecodeError, AttributeError):
        pass
c.close()

print(f\"Total Kafka messages consumed: {count}\")
for sid, info in sorted(streams.items()):
    print(f\"  stream={sid} records={info[\\\"records\\\"]} fields={len(info[\\\"fields\\\"])}\")

# 验证核心流
assert \"conn\" in streams, \"Missing conn stream\"
assert \"http\" in streams, \"Missing http stream\"
has_proto = any(\"proto\" in info[\"fields\"] for info in streams.values())
has_method = any(\"method\" in info[\"fields\"] for info in streams.values())
assert has_proto, \"No proto field found in any stream\"
assert has_method, \"No method field found in any stream\"
print(\"\\\\n[VERDICT] Kafka validation PASSED\")
"
' 2>&1)

echo "$CONSUMER_OUT"

if echo "$CONSUMER_OUT" | grep -q "PASSED"; then
    check "Kafka message validation" "0"
else
    check "Kafka message validation" "1"
fi

# ============================================================
# 5. 确认无本地 .log 文件（kafka_only 模式）
# ============================================================
echo "[step 5/5] Verifying no local log files written..."
LOG_FILES=$(docker exec "$PROBE_CONTAINER" sh -c 'ls /output/*.log 2>/dev/null' || true)
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

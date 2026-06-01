#!/bin/bash
# ============================================================
# zeek-run.sh — Zeek 统一启动加载器
#
# 功能：
#   1. 自动读取 extend/filters/*.bpf 中的所有 BPF 过滤规则
#   2. 用 and 连接所有规则，构造 -f 参数
#   3. 加载 extend/ 下的所有 *.zeek 扩展脚本
#   4. 条件加载 kafka-output.zeek 配置
#   5. 执行 zeek 启动命令（在线抓包或离线重放）
#
# 用法：
#   ./zeek-run.sh [interface]              # 默认 ens192 在线抓包
#   ./zeek-run.sh eth0                     # 指定网卡在线抓包
#   PROBE_PCAP=/path/to/file.pcap ./zeek-run.sh  # 离线重放 PCAP
#
# 环境变量：
#   PROBE_KAFKA_BROKERS     Kafka broker 地址（兼容 KAFKA_BROKERS）
#   PROBE_KAFKA_TOPIC       Kafka topic（默认 probe）
#   PROBE_KAFKA_ONLY        设为 true 时仅输出到 Kafka，不写本地文件
#   PROBE_PCAP              设为 pcap 文件路径时切换到离线 -r 模式
# ============================================================
set -euo pipefail

# ---------- 配置 ----------
INTERFACE="${1:-ens192}"
BPF_DIR="$(dirname "$0")/filters"
EXTEND_DIR="$(dirname "$0")"

# ============================================================
# 运行模式检测
# ============================================================
MODE="live"
PCAP_FILE=""
if [ -n "${PROBE_PCAP:-}" ]; then
    MODE="replay"
    PCAP_FILE="$PROBE_PCAP"
fi

# ---------- 组装 BPF 过滤规则（仅在线模式）----------
bpf_parts=()
if [ "$MODE" = "live" ] && [ -d "$BPF_DIR" ]; then
    for bpf_file in "$BPF_DIR"/*.bpf; do
        [ -f "$bpf_file" ] || continue
        rule=$(grep -v '^\s*#' "$bpf_file" | grep -v '^\s*$' | tr '\n' ' ')
        rule="${rule## }"
        rule="${rule%% }"
        if [ -n "$rule" ]; then
            bpf_parts+=("$rule")
            echo "[zeek-run] loaded BPF rule from $(basename "$bpf_file"): $rule" >&2
        fi
    done
fi

if [ ${#bpf_parts[@]} -gt 0 ]; then
    combined_bpf=$(IFS=' and '; echo "${bpf_parts[*]}")
    BPF_ARGS=("-f" "$combined_bpf")
    echo "[zeek-run] combined BPF filter: $combined_bpf" >&2
else
    BPF_ARGS=()
    [ "$MODE" = "live" ] && echo "[zeek-run] no BPF filter rules found, capturing all traffic" >&2
fi

# ---------- 组装 Zeek 扩展脚本 ----------
scripts=()
for zeek_file in "$EXTEND_DIR"/*.zeek; do
    [ -f "$zeek_file" ] || continue
    # kafka-output.zeek 由下面的 Kafka 块条件加载，这里跳过避免重复
    [ "$(basename "$zeek_file")" = "kafka-output.zeek" ] && continue
    scripts+=("$zeek_file")
    echo "[zeek-run] loaded script: $(basename "$zeek_file")" >&2
done

# ---------- Kafka 日志输出 ----------
# 兼容 fallback：PROBE_KAFKA_BROKERS 优先，KAFKA_BROKERS 兜底
: "${PROBE_KAFKA_BROKERS:=${KAFKA_BROKERS:-}}"

kafka_scripts=()
if [ -n "${PROBE_KAFKA_BROKERS:-}" ]; then
    # kafka-output.zeek 提供顶层 redef（send_all_active_logs, tag_json...）
    # 以及运行时 Log::remove_filter（当 kafka_only=T）
    # 必须先加载，这样下面的生成配置才能使用 Kafka::* redef
    kafka_scripts+=("$EXTEND_DIR/kafka-output.zeek")

    # 生成运行时配置（顶层 redef，解析时生效）
    # Kafka::topic_name 和 Kafka::kafka_conf 在这里设置而非 kafka-output.zeek
    # 因为需要 PROBE_KAFKA_BROKERS 的实际值
    cfg=$(mktemp /tmp/kafka-XXXXXX.zeek)
    cat > "$cfg" <<-ZEK
redef Probe::kafka_brokers = "${PROBE_KAFKA_BROKERS}";
redef Probe::kafka_topic = "${PROBE_KAFKA_TOPIC:-probe}";
$(if [ "${PROBE_KAFKA_ONLY:-}" = "true" ]; then echo 'redef Probe::kafka_only = T;'; fi)
redef Kafka::topic_name = "${PROBE_KAFKA_TOPIC:-probe}";
redef Kafka::kafka_conf = table(
    ["metadata.broker.list"] = "${PROBE_KAFKA_BROKERS}",
    ["client.id"] = "probe-$(hostname 2>/dev/null || echo 'unknown')"
);
ZEK
    kafka_scripts+=("$cfg")
    echo "[zeek-run] Kafka output enabled: ${PROBE_KAFKA_BROKERS} topic=${PROBE_KAFKA_TOPIC:-probe}" >&2
fi

# ============================================================
# 执行 Zeek
# ============================================================
case "$MODE" in
    live)
        echo "[zeek-run] starting zeek on interface $INTERFACE..." >&2
        exec zeek -i "$INTERFACE" "${BPF_ARGS[@]}" "${scripts[@]}" "${kafka_scripts[@]}"
        ;;
    replay)
        echo "[zeek-run] replaying pcap: $PCAP_FILE..." >&2
        exec zeek -r "$PCAP_FILE" "${scripts[@]}" "${kafka_scripts[@]}"
        ;;
esac

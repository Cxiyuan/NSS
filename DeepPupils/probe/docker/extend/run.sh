#!/bin/bash
# ============================================================
# zeek-run.sh — Zeek 统一启动加载器
#
# 功能：
#   1. 自动读取 extend/filters/*.bpf 中的所有 BPF 过滤规则
#   2. 用 and 连接所有规则，构造 -f 参数
#   3. 加载 extend/ 下的所有 *.zeek 扩展脚本
#   4. 执行 zeek 启动命令
#
# 用法：
#   ./zeek-run.sh [interface]          # 默认 ens192
#   ./zeek-run.sh eth0                 # 指定网卡
#
# 模块化设计：
#   每个 BPF 过滤场景独立成文件放在 extend/filters/ 下，
#   新增过滤规则只需在该目录下添加 .bpf 文件即可。
# ============================================================
set -euo pipefail

# ---------- 配置 ----------
INTERFACE="${1:-ens192}"
BPF_DIR="$(dirname "$0")/filters"
EXTEND_DIR="$(dirname "$0")"

# ---------- 组装 BPF 过滤规则 ----------
bpf_parts=()
if [ -d "$BPF_DIR" ]; then
    for bpf_file in "$BPF_DIR"/*.bpf; do
        [ -f "$bpf_file" ] || continue
        # 读取规则（跳过注释行和空行）
        rule=$(grep -v '^\s*#' "$bpf_file" | grep -v '^\s*$' | tr '\n' ' ')
        rule="${rule## }"   # 去掉前导空白
        rule="${rule%% }"   # 去掉尾部空白
        if [ -n "$rule" ]; then
            bpf_parts+=("$rule")
            echo "[zeek-run] loaded BPF rule from $(basename "$bpf_file"): $rule" >&2
        fi
    done
fi

# 组合所有规则
if [ ${#bpf_parts[@]} -gt 0 ]; then
    combined_bpf=$(IFS=' and '; echo "${bpf_parts[*]}")
    BPF_ARGS=("-f" "$combined_bpf")
    echo "[zeek-run] combined BPF filter: $combined_bpf" >&2
else
    BPF_ARGS=()
    echo "[zeek-run] no BPF filter rules found, capturing all traffic" >&2
fi

# ---------- 组装 Zeek 扩展脚本 ----------
scripts=()
for zeek_file in "$EXTEND_DIR"/*.zeek; do
    [ -f "$zeek_file" ] || continue
    # 跳过已通过 local.zeek 加载的脚本（避免重复）
    scripts+=("$zeek_file")
    echo "[zeek-run] loaded script: $(basename "$zeek_file")" >&2
done

# ---------- Kafka 日志输出（可选）----------
kafka_scripts=()
if [ -n "${KAFKA_BROKERS:-}" ]; then
    kafka_cfg=$(mktemp /tmp/kafka-XXXXXX.zeek)
    cat > "$kafka_cfg" <<-ZEK
redef Kafka::send_all_active_logs = T;
redef Kafka::topic_name = "${KAFKA_TOPIC:-probe}";
redef Kafka::tag_json = T;
redef Kafka::json_timestamps = JSON::TS_ISO8601;
redef Kafka::kafka_conf = table(
    ["metadata.broker.list"] = "${KAFKA_BROKERS}",
    ["client.id"] = "probe"
);
ZEK
    kafka_scripts+=("$kafka_cfg")
    echo "[zeek-run] Kafka output enabled: ${KAFKA_BROKERS}" >&2
fi

# ---------- 执行 Zeek ----------
echo "[zeek-run] starting zeek on interface $INTERFACE..." >&2
exec zeek -i "$INTERFACE" "${BPF_ARGS[@]}" "${scripts[@]}" "${kafka_scripts[@]}"

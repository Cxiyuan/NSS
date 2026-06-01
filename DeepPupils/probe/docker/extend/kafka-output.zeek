# ============================================================
# kafka-output.zeek — Kafka 日志输出模块
#
# 替代 run.sh 中的内联 Kafka 配置生成，独立的 Zeek 脚本。
# 由 run.sh 条件加载（当 PROBE_KAFKA_BROKERS 设置时）。
# 不由 local.zeek 加载，避免默认依赖 Kafka 插件。
#
# 依赖：zeek-kafka 插件（通过 Seiso::Kafka 命名空间）
#
# ⚠️  &redef 变量必须在顶层（parse time）修改，zeek_init()
#    事件触发时插件已初始化完毕，redef 不会生效。
# ============================================================

module Probe;

export {
    ## Kafka broker 地址列表（逗号分隔）
    ## 空值时不激活 Kafka 输出
    option kafka_brokers = "" &redef;

    ## Kafka topic 名称
    ## （由 run.sh 生成的 .zeek 配置在顶层 redef）
    option kafka_topic = "probe" &redef;

    ## 设为 T 时移除默认 ASCII 文件写入器，仅输出到 Kafka
    option kafka_only = F &redef;
}

# ============================================================
# 顶层 redef（解析时生效）
# 这些必须放在任何事件处理器之外，否则 Zeek 忽略它们
# ============================================================

redef Kafka::send_all_active_logs = T;
redef Kafka::tag_json = T;
redef Kafka::json_timestamps = JSON::TS_ISO8601;

# 注意：Kafka::topic_name 和 Kafka::kafka_conf 由 run.sh
# 生成的独立 .zeek 配置在顶层设置（需 PROBE_KAFKA_BROKERS 值）

# ============================================================
# 初始化日志（运行时检查选项）
# ============================================================

event zeek_init() &priority=20
{
    if ( Probe::kafka_brokers == "" )
        return;

    print fmt("[probe] Kafka output enabled: %s topic=%s",
              Probe::kafka_brokers, Probe::kafka_topic);
}

# ============================================================
# Kafka-only 模式：移除 ASCII 文件写入器
# ============================================================

event zeek_init() &priority=-10
{
    if ( Probe::kafka_brokers == "" )
        return;

    if ( ! Probe::kafka_only )
        return;

    # 移除 5 个核心日志流的默认 ASCII 写入器（filter name 为空串）
    # 仅操作已知已加载的协议流，避免为未加载协议调用导致编译错误
    Log::remove_filter(Conn::LOG, "");
    Log::remove_filter(HTTP::LOG, "");
    Log::remove_filter(DNS::LOG, "");
    Log::remove_filter(SSH::LOG, "");
    Log::remove_filter(SSL::LOG, "");

    print "[probe] ASCII log output disabled, Kafka-only mode active";
}

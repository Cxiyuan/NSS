# ============================================================
# kafka-output.zeek — Kafka 日志输出模块
#
# 替代 run.sh 中的内联 Kafka 配置生成，独立的 Zeek 脚本。
# 由 run.sh 条件加载（当 PROBE_KAFKA_BROKERS 设置时）。
# 不由 local.zeek 加载，避免默认依赖 Kafka 插件。
#
# 依赖：zeek-kafka 插件（通过 Seiso::Kafka 命名空间）
# ============================================================

module Probe;

export {
    ## Kafka broker 地址列表（逗号分隔）
    ## 空值时不激活 Kafka 输出
    option kafka_brokers = "" &redef;

    ## Kafka topic 名称
    option kafka_topic = "probe" &redef;

    ## 设为 T 时移除默认 ASCII 文件写入器，仅输出到 Kafka
    option kafka_only = F &redef;
}

# ============================================================
# Kafka 全局配置
# ============================================================

# 仅在 brokes 非空时激活
event zeek_init() &priority=20
{
    if ( Probe::kafka_brokers == "" )
        return;

    # send_all_active_logs = T 确保所有活动日志流发送到 Kafka
    redef Kafka::send_all_active_logs = T;
    redef Kafka::topic_name = Probe::kafka_topic;
    redef Kafka::tag_json = T;
    redef Kafka::json_timestamps = JSON::TS_ISO8601;
    redef Kafka::kafka_conf = table(
        ["metadata.broker.list"] = Probe::kafka_brokers,
        ["client.id"] = fmt("probe-%s", gethostname())
    );

    print fmt("[probe] Kafka output enabled: %s topic=%s", Probe::kafka_brokers, Probe::kafka_topic);
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

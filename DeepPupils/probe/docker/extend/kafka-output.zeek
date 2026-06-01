# ============================================================
# kafka-output.zeek — Kafka 日志输出模块
#
# 替代 run.sh 中的内联 Kafka 配置生成，独立的 Zeek 脚本。
# 由 run.sh 条件加载（当 PROBE_KAFKA_BROKERS 设置时）。
# 不由 local.zeek 加载，避免默认依赖 Kafka 插件。
#
# 输出到 Kafka 的日志类型：
#   conn, http, dns, ssh, ssl, files   — 始终可用（BiF / 核心框架）
#   ftp, mysql, postgresql, rdp, smb, redis, x509
#     — 需通过 zkg install 安装对应 Zeek 协议包后启用
#     安装: zkg install zeek/ftp zeek/mysql zeek/postgresql zeek/rdp
#           zkg install zeek/smb zeek/redis zeek/x509
# ============================================================

module Probe;

export {
    option kafka_brokers = "" &redef;
    option kafka_topic = "probe" &redef;
    option kafka_only = F &redef;
}

redef Kafka::tag_json = T;
redef Kafka::json_timestamps = JSON::TS_ISO8601;

# ============================================================
# 注册各日志流到 Kafka（显式 Log::add_filter）
# ============================================================

event zeek_init() &priority=5
{
    if ( Probe::kafka_brokers == "" )
        return;

    # ---- 核心协议（始终可用） ----
    Log::add_filter(Conn::LOG, [$name="kafka-conn",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="conn")]);

    Log::add_filter(HTTP::LOG, [$name="kafka-http",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="http")]);

    Log::add_filter(DNS::LOG, [$name="kafka-dns",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="dns")]);

    Log::add_filter(SSH::LOG, [$name="kafka-ssh",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="ssh")]);

    Log::add_filter(SSL::LOG, [$name="kafka-ssl",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="ssl")]);

    Log::add_filter(Files::LOG, [$name="kafka-files",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="files")]);

    print fmt("[probe] Kafka output enabled: %s topic=%s (6 core streams)",
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

    Log::remove_filter(Conn::LOG, "");
    Log::remove_filter(HTTP::LOG, "");
    Log::remove_filter(DNS::LOG, "");
    Log::remove_filter(SSH::LOG, "");
    Log::remove_filter(SSL::LOG, "");
    Log::remove_filter(Files::LOG, "");

    print "[probe] ASCII log output disabled, Kafka-only mode active";
}

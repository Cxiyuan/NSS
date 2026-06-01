# ============================================================
# kafka-output.zeek — Kafka 日志输出模块
#
# 替代 run.sh 中的内联 Kafka 配置生成，独立的 Zeek 脚本。
# 由 run.sh 条件加载（当 PROBE_KAFKA_BROKERS 设置时）。
# 不由 local.zeek 加载，避免默认依赖 Kafka 插件。
#
# 输出到 Kafka 的日志类型（共 13 种）：
#   核心: conn, http, dns, ssh, ssl, files
#   扩展: ftp, rdp, x509, smb, mysql, postgresql, redis
#
# 所有协议均在 Zeek 8.2.0 base/protocols/ 中，
# 基础镜像已包含，无需额外安装。
# ============================================================

module Probe;

export {
    option kafka_brokers = "" &redef;
    option kafka_topic = "probe" &redef;
    option kafka_only = F &redef;
}

# ============================================================
# 加载扩展协议脚本（确保日志流可用）
# 所有协议均在 base/protocols/ 中，由基础镜像提供
# ============================================================

@load base/protocols/ftp
@load base/protocols/rdp
@load base/protocols/x509
@load base/protocols/smb
@load base/protocols/mysql
@load base/protocols/postgresql
@load base/protocols/redis

redef Kafka::tag_json = T;
redef Kafka::json_timestamps = JSON::TS_ISO8601;

# ============================================================
# 注册各日志流到 Kafka
# ============================================================

event zeek_init() &priority=5
{
    if ( Probe::kafka_brokers == "" )
        return;

    # ---- 核心协议 ----
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

    # ---- 扩展协议 ----
    Log::add_filter(FTP::LOG, [$name="kafka-ftp",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="ftp")]);
    Log::add_filter(RDP::LOG, [$name="kafka-rdp",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="rdp")]);
    Log::add_filter(X509::LOG, [$name="kafka-x509",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="x509")]);
    Log::add_filter(SMB::LOG, [$name="kafka-smb",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="smb")]);
    Log::add_filter(MySQL::LOG, [$name="kafka-mysql",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="mysql")]);
    Log::add_filter(PostgreSQL::LOG, [$name="kafka-postgresql",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="postgresql")]);
    Log::add_filter(Redis::LOG, [$name="kafka-redis",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="redis")]);

    print fmt("[probe] Kafka output enabled: %s topic=%s (13 streams)",
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
    Log::remove_filter(FTP::LOG, "");
    Log::remove_filter(RDP::LOG, "");
    Log::remove_filter(X509::LOG, "");
    Log::remove_filter(SMB::LOG, "");
    Log::remove_filter(MySQL::LOG, "");
    Log::remove_filter(PostgreSQL::LOG, "");
    Log::remove_filter(Redis::LOG, "");

    print "[probe] ASCII log output disabled, Kafka-only mode active";
}

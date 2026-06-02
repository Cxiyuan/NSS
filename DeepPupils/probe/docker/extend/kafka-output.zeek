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
# 默认写入器设为 NONE：新创建的日志流不自动挂 ASCII 写入器
# 必须放在 @load 之前，确保后续协议脚本的 Log::create_stream 使用 NONE
# 已存在的核心流（conn/http/dns/ssh/ssl 等）仍需要 Log::remove_filter
# ============================================================
redef Log::default_writer = Log::WRITER_NONE;

# ============================================================

@load base/protocols/ftp
@load base/protocols/rdp
# X509::LOG 是 SSL 分析器 BiF 的一部分，无需 @load
@load base/protocols/smb
@load base/protocols/mysql
@load base/protocols/postgresql
@load base/protocols/redis
@load base/protocols/dhcp
@load base/protocols/krb
@load base/protocols/ldap
@load base/protocols/mqtt
@load base/protocols/ntp
@load base/protocols/quic
@load base/protocols/radius
@load base/protocols/sip
@load base/protocols/snmp
@load base/protocols/syslog
@load base/protocols/websocket
@load base/protocols/tunnels
@load base/files/pe

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
    Log::add_filter(SMB::FILES_LOG, [$name="kafka-smb-files",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="smb_files")]);
    Log::add_filter(SMB::MAPPING_LOG, [$name="kafka-smb-mapping",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="smb_mapping")]);
    Log::add_filter(mysql::LOG, [$name="kafka-mysql",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="mysql")]);
    Log::add_filter(PostgreSQL::LOG, [$name="kafka-postgresql",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="postgresql")]);
    Log::add_filter(Redis::LOG, [$name="kafka-redis",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="redis")]);
    Log::add_filter(SIP::LOG, [$name="kafka-sip",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="sip")]);
    Log::add_filter(SNMP::LOG, [$name="kafka-snmp",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="snmp")]);

    print fmt("[probe] Kafka output enabled: %s topic=%s (16 streams)",
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
    Log::remove_filter(SMB::FILES_LOG, "");
    Log::remove_filter(SMB::MAPPING_LOG, "");
    Log::remove_filter(mysql::LOG, "");
    Log::remove_filter(PostgreSQL::LOG, "");
    Log::remove_filter(Redis::LOG, "");
    Log::remove_filter(DHCP::LOG, "");
    Log::remove_filter(KRB::LOG, "");
    Log::remove_filter(LDAP::LDAP_LOG, "");
    Log::remove_filter(LDAP::LDAP_SEARCH_LOG, "");
    Log::remove_filter(MQTT::CONNECT_LOG, "");
    Log::remove_filter(MQTT::SUBSCRIBE_LOG, "");
    Log::remove_filter(MQTT::PUBLISH_LOG, "");
    Log::remove_filter(NTP::LOG, "");
    Log::remove_filter(QUIC::LOG, "");
    Log::remove_filter(RADIUS::LOG, "");
    Log::remove_filter(SIP::LOG, "");
    Log::remove_filter(SNMP::LOG, "");
    Log::remove_filter(Syslog::LOG, "");
    Log::remove_filter(WebSocket::LOG, "");
    Log::remove_filter(Tunnel::LOG, "");
    Log::remove_filter(PE::LOG, "");
    Log::remove_filter(Weird::LOG, "");
    Log::remove_filter(Notice::LOG, "");
    Log::remove_filter(OCSP::LOG, "");
    Log::remove_filter(Analyzer::Logging::LOG, "");

    print "[probe] ASCII log output disabled, Kafka-only mode active";
}

# ============================================================
# kafka-output.zeek — Kafka 日志输出模块
#
# 替代 run.sh 中的内联 Kafka 配置生成，独立的 Zeek 脚本。
# 由 run.sh 条件加载（当 PROBE_KAFKA_BROKERS 设置时）。
# 不由 local.zeek 加载，避免默认依赖 Kafka 插件。
#
# 依赖：zeek-kafka 插件（编译到 Zeek 中的 BiF 插件）
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
    option kafka_topic = "probe" &redef;

    ## 设为 T 时移除默认 ASCII 文件写入器，仅输出到 Kafka
    option kafka_only = F &redef;
}

# ============================================================
# 加载协议脚本包（确保日志流可用）
# ============================================================

@load base/protocols/ftp
@load policy/protocols/rdp
@load policy/protocols/x509
@load policy/protocols/smb
@load policy/protocols/mysql
@load policy/protocols/postgresql
@load policy/protocols/redis

# ============================================================
# 顶层 redef（解析时生效）
# ============================================================

redef Kafka::tag_json = T;
redef Kafka::json_timestamps = JSON::TS_ISO8601;

# 注意：Kafka::topic_name 和 Kafka::kafka_conf 由 run.sh
# 生成的独立 .zeek 配置在顶层设置（需 PROBE_KAFKA_BROKERS 值）

# ============================================================
# 为各日志流注册 Kafka 写入器（显式 add_filter）
# 在 priority=5 执行，早于 kafka_only 的 remove_filter (priority=-10)
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

    # ---- 文件分析框架 ----
    Log::add_filter(Files::LOG, [$name="kafka-files",
        $writer=Log::WRITER_KAFKAWRITER,
        $config=table(["stream_id"]="files")]);

    # ---- 应用层协议 ----
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

    # 移除所有已注册流的默认 ASCII 写入器（filter name 为空串）
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

FROM zeek/zeek:8.2.0

LABEL maintainer="probe"
LABEL version="v1.0"
LABEL description="Probe network monitoring tool based on Zeek"

ARG CACHE_BUST=0
RUN echo "cache_bust=${CACHE_BUST}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/probe

COPY . /opt/probe/

# 复制扩展脚本到 Zeek 加载目录
COPY extend/ /opt/probe/extend/

ENV PATH="/opt/probe/bin:${PATH}"

# 在 local.zeek 中注册扩展脚本（兜底机制）
# 主加载入口：run.sh 通过命令行参数加载扩展脚本
# 兜  底：local.zeek 中的 @load 在 zeek -r 离线分析等场景生效
RUN for site_dir in /opt/zeek/share/zeek/site /usr/local/zeek/share/zeek/site; do \
        if [ -d "$site_dir" ]; then \
            echo "@load /opt/probe/extend/http-extend.zeek" >> "$site_dir/local.zeek" && \
            echo "# drop_multicast.zeek: PacketFilter::exclude() 兜底（主过滤由 run.sh 的 -f BPF 完成）" >> "$site_dir/local.zeek" && \
            echo "@load /opt/probe/extend/drop_multicast.zeek" >> "$site_dir/local.zeek" && \
            echo "[OK] registered scripts in $site_dir/local.zeek"; \
            break; \
        fi; \
    done

# ============================================================
# 编译并安装 zeek-kafka 插件（Zeek 8.2.0 兼容补丁）
# Zeek 8.2.0 中 ODesc::Len() 已更名为 Size()
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ make cmake pkgconf librdkafka-dev git \
    && git clone https://github.com/SeisoLLC/zeek-kafka.git /tmp/zeek-kafka \
    && cd /tmp/zeek-kafka \
    && git checkout v1.2.0 \
    && sed -i 's/tsfmt\.Len()/tsfmt.Size()/' src/KafkaWriter.cc \
    && python3 -c "
import re
with open('src/KafkaWriter.cc') as f:
    content = f.read()
old = '''bool KafkaWriter::DoFinish(double network_time) {
  bool success = false;
  int poll_interval = 1000;
  int waited = 0;
  int max_wait = BifConst::Kafka::max_wait_on_shutdown;

  if (!mocking) {
    // wait a bit for queued messages to be delivered
    while (producer->outq_len() > 0 && waited <= max_wait) {
      producer->poll(poll_interval);
      waited += poll_interval;
    }

    // successful only if all messages delivered
    if (producer->outq_len() == 0) {
      success = true;
    } else {
      Error(Fmt(\"Unable to deliver %0d message(s)\", producer->outq_len()));
    }

    delete topic;
    delete producer;
    delete topic_conf;
  }
  delete formatter;
  delete conf;

  return success;
}'''
new = '''bool KafkaWriter::DoFinish(double network_time) {
  bool success = false;
  int max_wait = BifConst::Kafka::max_wait_on_shutdown;

  if (!mocking) {
    // Blocking flush — waits up to max_wait ms for all queued messages
    // to be delivered.  Critical in offline (-r) mode where Zeek may
    // shut down before librdkafka finishes establishing a connection.
    RdKafka::ErrorCode err = producer->flush(max_wait);
    if (err == RdKafka::ERR_NO_ERROR) {
      success = true;
    } else {
      Error(Fmt(\"Kafka flush failed after %d ms: %s (%0d undelivered)\",
                max_wait, RdKafka::err2str(err).c_str(), producer->outq_len()));
    }

    delete topic;
    delete producer;
    delete topic_conf;
  }
  delete formatter;
  delete conf;

  return success;
}'''
content = content.replace(old, new)
with open('src/KafkaWriter.cc', 'w') as f:
    f.write(content)
print('[OK] DoFinish flush patch applied')
" \
    && ./configure --with-librdkafka=/usr \
    && make -C build -j$(nproc) \
    && make -C build install \
    && ldconfig \
    && zeek -N Seiso::Kafka \
    && echo "[OK] zeek-kafka plugin installed" \
    && apt-get purge -y g++ make cmake pkgconf \
    && rm -rf /var/lib/apt/lists/* \
    || echo "[WARN] zeek-kafka build failed (non-critical)"

# run.sh 是统一的启动入口，自动组装 BPF 过滤规则 + 加载扩展脚本
# 用法：
#   docker run ... probe                   # 默认 ens192
#   docker run ... probe eth0              # 指定网卡
ENTRYPOINT ["/opt/probe/extend/run.sh"]
CMD ["ens192"]
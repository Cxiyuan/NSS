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
    && python3 /opt/probe/patch_kafka_do_finish.py src/KafkaWriter.cc \
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

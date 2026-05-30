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

# 注册扩展脚本到 Zeek（多路径兜底写入 local.zeek）
RUN for site_dir in /opt/zeek/share/zeek/site /usr/local/zeek/share/zeek/site; do \
        if [ -d "$site_dir" ]; then \
            echo "@load /opt/probe/extend/http-extend.zeek" >> "$site_dir/local.zeek" && \
            echo "@load /opt/probe/extend/drop_multicast.zeek" >> "$site_dir/local.zeek" && \
            echo "[OK] registered http-extend in $site_dir/local.zeek"; \
            break; \
        fi; \
    done && \
    zeek -N 2>&1 | grep -q "http-extend" && echo "[OK] http-extend verified" || echo "[WARN] http-extend not found in zeek -N output"

CMD ["zeek"]
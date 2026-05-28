FROM zeek/zeek:8.2.0

LABEL maintainer="probe"
LABEL version="v1.0"
LABEL description="Probe network monitoring tool based on Zeek"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/probe

COPY . /opt/probe/

# 复制扩展脚本到 Zeek 加载目录
COPY extend/ /opt/probe/extend/

ENV PATH="/opt/probe/bin:${PATH}"

# 注册扩展脚本到 Zeek 加载（追加到 site/local.zeek）
RUN echo "@load /opt/probe/extend/http-extend" >> /opt/zeek/share/zeek/site/local.zeek

CMD ["zeek"]
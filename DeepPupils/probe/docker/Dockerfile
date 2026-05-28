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

ENV PATH="/opt/probe/bin:${PATH}"

CMD ["zeek"]
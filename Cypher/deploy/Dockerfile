# =============================================================================
# Cypher — 弱口令检测系统 (AVX512)
# Multi-stage: builder (John Jumbo) → runtime (Python + John)
# =============================================================================

# ─── Stage 1: Builder (compile John the Ripper) ──────────────
FROM ubuntu:22.04 AS builder

LABEL stage="john-builder"

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git ca-certificates \
    libssl-dev libgmp-dev zlib1g-dev \
    libbz2-dev libpcap-dev \
    && rm -rf /var/lib/apt/lists/*

ARG JOHN_VERSION=bleeding-jumbo
ARG MAKE_FLAGS=-j$(nproc)
# CI runner 无 AVX512 -> auto-detect; 自托管 AVX512 传 --build-arg SIMD_FLAGS=--enable-simd=AVX512
ARG SIMD_FLAGS=--enable-simd

WORKDIR /build
RUN git clone --depth=1 --branch=${JOHN_VERSION} https://github.com/openwall/john.git john

WORKDIR /build/john/src
RUN ./configure ${SIMD_FLAGS} --disable-opencl CFLAGS="-O3"
RUN make ${MAKE_FLAGS} && make install

# ─── Stage 2: Runtime ────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

LABEL description="Cypher — Weak Password Detection System"

ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    hydra ncrack \
    && rm -rf /var/lib/apt/lists/*

# John 二进制 + 运行时文件
COPY --from=builder /usr/local/bin/john /usr/local/bin/john
COPY --from=builder /build/john/run/john.conf /usr/local/etc/john/john.conf

# Python 依赖
COPY Cypher/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Cypher 源码
WORKDIR /opt/cypher
COPY Cypher/src/ ./src/
COPY Cypher/tests/ ./tests/

# 验证
RUN john --version && python3 --version

ENTRYPOINT ["python3"]
CMD ["-m", "src.john_wrapper", "--help"]

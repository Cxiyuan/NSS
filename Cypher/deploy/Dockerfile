# =============================================================================
# Cypher — 弱口令检测系统
# Multi-stage Docker build
#
# Stage 1: builder  — 编译 John the Ripper Jumbo 带 AVX512
# Stage 2: runtime  — Python + John + Hydra + Ncrack + 工具脚本
# =============================================================================

# ─── Stage 1: Builder ─────────────────────────────────────────
FROM ubuntu:22.04 AS builder

LABEL stage="john-builder"
LABEL description="John the Ripper Jumbo with AVX512 — build stage"

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git curl ca-certificates \
    libssl-dev libgmp-dev libmpfr-dev libmpc-dev zlib1g-dev \
    libbz2-dev libpcap-dev libkrb5-dev libnss3-dev \
    ocl-icd-opencl-dev opencl-headers \
    && rm -rf /var/lib/apt/lists/*

ARG JOHN_VERSION=bleeding-jumbo
ARG JOHN_REPO=https://github.com/openwall/john.git
ARG MAKE_FLAGS=-j$(nproc)
ARG SIMD_FLAGS=--enable-simd=AVX512

WORKDIR /build
RUN git clone --depth=1 --branch=${JOHN_VERSION} ${JOHN_REPO} john

WORKDIR /build/john/src
RUN ./configure ${SIMD_FLAGS} --enable-rexgen \
    CPPFLAGS="-mavx512f -mavx512bw -mavx512dq -mavx512cd -mavx512vl" \
    CFLAGS="-O3 -march=native -mtune=native" 2>&1 | tee /tmp/configure.log

RUN make ${MAKE_FLAGS} \
    && cp ../run/john /usr/local/bin/john

RUN john --list=build-info 2>&1 | head -30

# ─── Stage 2: Runtime ─────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

LABEL description="Cypher — Weak Password Detection System"
LABEL version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    libssl3 libgmp10 libpcap0.8 libbz2-1.0 \
    hydra ncrack curl ca-certificates \
    procps lshw tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/john /usr/local/bin/john
COPY --from=builder /build/john/run/john.conf /etc/john/john.conf
COPY --from=builder /build/john/run/rules/*.rule /etc/john/rules/

WORKDIR /opt/cypher

COPY Cypher/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY Cypher/src/ ./src/
COPY Cypher/pcfg/ ./pcfg/
COPY Cypher/tests/ ./tests/

RUN python3 --version \
    && john --version \
    && hydra -h 2>&1 | head -3 \
    && ncrack -h 2>&1 | head -3

ENTRYPOINT ["python3"]
CMD ["-m", "src.john_wrapper", "--help"]

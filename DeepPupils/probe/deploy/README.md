# Probe 生产部署

基于 Zeek 的网络探针，捕获流量 → HTTP 日志富化 → 输出到 Kafka。

## 快速部署

```bash
# 1. 配置环境变量
cp .env.example .env
vi .env

# 2. 启动所有服务
docker compose up -d

# 3. 验证运行状态
docker compose ps
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PROBE_KAFKA_BROKERS` | `localhost:9092` | Kafka broker 地址 |
| `PROBE_KAFKA_TOPIC` | `probe` | Kafka topic 名称 |
| `PROBE_INTERFACE` | `ens192` | 监听网卡接口 |
| `KAFKA_LOG_RETENTION_DAYS` | `15` | Kafka 日志保留天数 |
| `PROBE_LOG_DIR` | `/var/log/probe` | 日志挂载目录 |

## 架构

```
流量 → ens192 → Zeek → http-extend.zeek → kafka-output.zeek → Kafka
                          ↓                    ↓
                     drop_multicast.bpf    kafka_only=T
                     (BPF 过滤组播)      (不写本地文件)
```

## 输出到 Kafka 的日志类型

### 内置 Always-on（6 种，无需额外配置）

| stream_id | 日志内容 | 说明 |
|-----------|---------|------|
| `conn` | 连接日志 | TCP/UDP/ICMP 连接元数据 |
| `http` | HTTP 日志 | 含 22 个扩展字段（Authorization/Cookie/Body/XFF 等） |
| `dns` | DNS 日志 | 查询、响应类型、NXDOMAIN 等 |
| `ssh` | SSH 日志 | 版本号协商 |
| `ssl` | SSL/TLS 日志 | 版本、密码套件、SNI |
| `files` | 文件分析日志 | Zeek Files 框架 |

### 扩展协议（内置于 Zeek 8.2.0 base/protocols/）

| stream_id | 日志内容 | 说明 |
|-----------|---------|------|
| `ftp` | FTP 日志 | 文件传输协议 |
| `rdp` | RDP 日志 | 远程桌面协议 |
| `x509` | X.509 证书日志 | TLS 证书链信息 |
| `smb` | SMB 日志 | Windows 文件共享 |
| `mysql` | MySQL 日志 | SQL 查询审计 |
| `postgresql` | PostgreSQL 日志 | SQL 查询审计 |
| `redis` | Redis 日志 | 缓存/消息队列协议 |

## 验证数据

```bash
# 消费 Kafka topic 查看日志
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic probe \
  --from-beginning \
  --max-messages 5
```

## 目录结构

```
deploy/
├── docker-compose.yml   # 生产编排文件
├── .env.example         # 环境变量模板
└── README.md            # 本文件
```

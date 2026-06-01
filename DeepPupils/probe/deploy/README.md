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

#!/usr/bin/env python3
"""Consume Zeek probe logs from Kafka and validate stream content."""
import json
import os
import sys

from kafka import KafkaConsumer

topic = os.environ["TOPIC"]
broker = os.environ.get("BROKER", "kafka:9092")

c = KafkaConsumer(
    topic,
    bootstrap_servers=broker,
    auto_offset_reset="earliest",
    consumer_timeout_ms=15000,
)

streams = {}
count = 0
for msg in c:
    try:
        val = json.loads(msg.value)
        if not isinstance(val, dict):
            continue
        for key, sub in val.items():
            if isinstance(sub, dict):
                sid = key
                if sid not in streams:
                    streams[sid] = {"records": 0, "fields": set()}
                streams[sid]["records"] += 1
                streams[sid]["fields"].update(sub.keys())
        count += 1
    except Exception:
        pass
c.close()

print(f"Total Kafka messages consumed: {count}")
for sid, info in sorted(streams.items()):
    print(f"  stream={sid} records={info['records']} fields={len(info['fields'])}")

# 核心协议必须存在
for core in ["conn", "http", "dns", "ssh", "ssl"]:
    assert core in streams, f"Missing {core} stream"

# 扩展协议必须存在（由 extra_protocols.py 生成，使用 Zeek 测试集真实字节）
for ext in ["ftp", "rdp", "smb", "mysql", "postgresql", "redis", "sip", "snmp"]:
    assert ext in streams, f"Missing {ext} stream — Zeek did not detect this protocol"
    print(f"  [+] {ext} stream present ({streams[ext]['records']} records)")

has_proto = any("proto" in info["fields"] for info in streams.values())
has_method = any("method" in info["fields"] for info in streams.values())
assert has_proto, "No proto field found in any stream"
assert has_method, "No method field found in any stream"
print("[VERDICT] Kafka validation PASSED")

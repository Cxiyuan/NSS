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

assert "conn" in streams, "Missing conn stream"
assert "http" in streams, "Missing http stream"
assert "dns" in streams, "Missing dns stream"

# 扩展协议（由 extra_protocols.py 生成）
for proto in ["ftp", "mysql", "postgresql", "redis", "sip"]:
    if proto in streams:
        print(f"  [+] {proto} stream present ({streams[proto]['records']} records)")
    else:
        print(f"  [-] {proto} stream not found (may need more complete handshake)")

# 至少要有 5 个核心协议
assert len(streams) >= 5, f"Too few streams: {len(streams)}"

has_proto = any("proto" in info["fields"] for info in streams.values())
has_method = any("method" in info["fields"] for info in streams.values())
assert has_proto, "No proto field found in any stream"
assert has_method, "No method field found in any stream"
print("[VERDICT] Kafka validation PASSED")

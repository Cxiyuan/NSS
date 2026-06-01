#!/usr/bin/env python3
"""
Kafka 日志输出验证脚本 — 消费 Kafka topic 中的 Zeek JSON 消息并做精确值匹配。
被 CI workflow 调用：python3 test_kafka_output.py --broker HOST:PORT --topic TOPIC --scenario NAME
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

try:
    from kafka import KafkaConsumer
except ImportError:
    KafkaConsumer = None


# ============================================================
# 各场景的精确值验证函数
# ============================================================

def verify_auth(records):
    """Authorization 头验证：Basic + Bearer + Proxy-Authorization"""
    assert len(records) > 0, "auth: 无消息到达 Kafka"
    
    auths = [r.get("authorizations", "") for r in records if r.get("authorizations")]
    assert any("Basic" in a for a in auths), "auth: 缺少 Basic Authorization"
    assert any("Bearer" in a for a in auths), "auth: 缺少 Bearer Authorization"
    
    proxies = [r.get("proxy_authorization", "") for r in records if r.get("proxy_authorization")]
    assert any("Basic" in p for p in proxies), "auth: 缺少 Proxy-Authorization"
    print(f"  [PASS] authorizations: {len(auths)} 条")


def verify_proxy(records):
    """代理头验证：X-Forwarded-For、X-Real-IP"""
    assert len(records) > 0, "proxy: 无消息到达 Kafka"
    
    xffs = [r.get("xff", "") for r in records if r.get("xff")]
    assert any("203.0.113.195" in x for x in xffs), "proxy: X-Forwarded-For 缺少 203.0.113.195"
    
    real_ips = [r.get("x_real_ip", "") for r in records if r.get("x_real_ip")]
    assert any(ip == "203.0.113.195" for ip in real_ips), "proxy: X-Real-IP 值错误"
    
    client_ips = [r.get("client_ip", "") for r in records if r.get("client_ip")]
    assert any(ip == "203.0.113.195" for ip in client_ips), "proxy: client_ip 提取错误"
    print(f"  [PASS] xff: {len(xffs)} 条, X-Real-IP: {len(real_ips)} 条")


def verify_cookies(records):
    """Cookie / Set-Cookie 验证"""
    assert len(records) > 0, "cookies: 无消息到达 Kafka"
    
    cookies = [r.get("cookies", "") for r in records if r.get("cookies")]
    assert any("sessionid" in c for c in cookies), "cookies: 缺少 sessionid"
    assert any("csrf_token" in c for c in cookies), "cookies: 缺少 csrf_token"
    
    set_cookies = [r.get("set_cookie", "") for r in records if r.get("set_cookie")]
    assert any("HttpOnly" in s for s in set_cookies), "cookies: Set-Cookie 缺少 HttpOnly"
    assert any("SameSite" in s for s in set_cookies), "cookies: Set-Cookie 缺少 SameSite"
    print(f"  [PASS] cookies: {len(cookies)} 条, set_cookie: {len(set_cookies)} 条")


def verify_body(records):
    """请求/响应体验证"""
    assert len(records) > 0, "body: 无消息到达 Kafka"
    
    req_bodies = [r.get("req_body", "") for r in records if r.get("req_body")]
    all_req = " ".join(req_bodies)
    assert "username" in all_req, "body: req_body 缺少 username"
    assert "password" in all_req, "body: req_body 缺少 password"
    
    resp_bodies = [r.get("resp_body", "") for r in records if r.get("resp_body")]
    all_resp = " ".join(resp_bodies)
    assert "Welcome" in all_resp or "Login" in all_resp, "body: resp_body 缺少 Welcome/Login"
    print(f"  [PASS] req_body: {len(req_bodies)} 条, resp_body: {len(resp_bodies)} 条")


def verify_headers(records):
    """标准请求/响应头验证"""
    assert len(records) > 0, "headers: 无消息到达 Kafka"
    
    # 请求头
    assert any(r.get("accept") for r in records), "headers: 缺少 accept"
    assert any(r.get("accept_language") for r in records), "headers: 缺少 accept_language"
    assert any(r.get("accept_encoding") for r in records), "headers: 缺少 accept_encoding"
    assert any(r.get("user_agent") for r in records), "headers: 缺少 user_agent"
    
    # 响应头
    servers = [r.get("server_header", "") for r in records if r.get("server_header")]
    assert any("Apache" in s for s in servers), "headers: server_header 非 Apache"
    
    assert any(r.get("date_header") for r in records), "headers: 缺少 date_header"
    assert any(r.get("connection_header") for r in records), "headers: 缺少 connection_header"
    print(f"  [PASS] headers: {len(records)} 条, server_header={servers[0] if servers else 'N/A'}")


def verify_methods(records):
    """HTTP 方法覆盖验证"""
    assert len(records) > 0, "methods: 无消息到达 Kafka"
    
    methods = set(r.get("method") for r in records if r.get("method"))
    expected = {"GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"}
    missing = expected - methods
    assert not missing, f"methods: 缺少 {missing}, 现有 {methods}"
    print(f"  [PASS] methods: {sorted(methods)}")


def verify_status(records):
    """HTTP 状态码覆盖验证"""
    assert len(records) > 0, "status: 无消息到达 Kafka"
    
    codes = [r.get("status_code") for r in records if r.get("status_code")]
    has_2xx = any(200 <= c < 300 for c in codes)
    has_3xx = any(300 <= c < 400 for c in codes)
    has_4xx = any(400 <= c < 500 for c in codes)
    has_5xx = any(500 <= c < 600 for c in codes)
    
    assert has_2xx, "status: 缺少 2xx 状态码"
    assert has_4xx, "status: 缺少 4xx 状态码"
    assert has_5xx, "status: 缺少 5xx 状态码"
    print(f"  [PASS] status_codes: {sorted(set(codes))}")


def verify_multicast(records):
    """组播过滤验证：只有单播流量到达 Kafka"""
    assert len(records) > 0, "multicast: 无消息到达 Kafka"
    
    for r in records:
        id_ = r.get("id", {})
        resp_h = id_.get("resp_h", "") if isinstance(id_, dict) else ""
        if resp_h:
            first = int(resp_h.split(".")[0])
            assert first < 224 or first > 239, f"multicast: 组播IP {resp_h} 不应出现在 Kafka 中"
    print(f"  [PASS] multicast: {len(records)} 条单播记录")


def verify_boundary_large_header(records):
    """超大 Header 边界测试：Zeek 不崩溃，有消息到达"""
    assert len(records) > 0, "boundary_large_header: 无消息到达 Kafka (Zeek 可能崩溃)"
    print(f"  [PASS] boundary_large_header: {len(records)} 条记录")


def verify_boundary_large_body(records):
    """超大 Body 边界测试"""
    assert len(records) > 0, "boundary_large_body: 无消息到达 Kafka (Zeek 可能崩溃)"
    print(f"  [PASS] boundary_large_body: {len(records)} 条记录")


def verify_boundary_special_char(records):
    """特殊字符边界测试"""
    assert len(records) > 0, "boundary_special_char: 无消息到达 Kafka (Zeek 可能崩溃)"
    print(f"  [PASS] boundary_special_char: {len(records)} 条记录")


def verify_boundary_mixed_encoding(records):
    """混合编码边界测试"""
    assert len(records) > 0, "boundary_mixed_encoding: 无消息到达 Kafka (Zeek 可能崩溃)"
    print(f"  [PASS] boundary_mixed_encoding: {len(records)} 条记录")


def verify_http_files(records):
    """文件日志验证"""
    assert len(records) > 0, "http_files: 无消息到达 Kafka"
    
    # Files 框架产生的记录在 http log 中可能以 http 字段存在
    # 或通过 files log 独立 topic 发送
    http_recs = [r for r in records if r.get("method")]
    assert len(http_recs) > 0, "http_files: 无 HTTP 记录"
    print(f"  [PASS] http_files: {len(http_recs)} 条 HTTP 记录")


def verify_conn(records):
    """连接日志验证：TCP/UDP/ICMP 连接字段"""
    assert len(records) > 0, "conn: 无消息到达 Kafka"

    protos = {r.get("proto") for r in records if r.get("proto")}
    assert "tcp" in protos or "udp" in protos, f"conn: 缺少 tcp/udp 协议, 有 {protos}"

    orig_bytes = [r.get("orig_bytes") for r in records if r.get("orig_bytes") is not None]
    resp_bytes = [r.get("resp_bytes") for r in records if r.get("resp_bytes") is not None]
    assert len(orig_bytes) > 0, "conn: 缺少 orig_bytes"
    assert len(resp_bytes) > 0, "conn: 缺少 resp_bytes"

    states = {r.get("conn_state") for r in records if r.get("conn_state")}
    assert len(states) > 0, "conn: 缺少 conn_state"
    print(f"  [PASS] conn: {len(records)} 条, protos={protos}, states={states}")


def verify_dns(records):
    """DNS 日志验证：query, qtype, rcode"""
    assert len(records) > 0, "dns: 无消息到达 Kafka"

    queries = [r.get("query") for r in records if r.get("query")]
    assert len(queries) > 0, "dns: 缺少 query 字段"

    qtypes = {r.get("qtype_name") for r in records if r.get("qtype_name")}
    assert len(qtypes) > 0, "dns: 缺少 qtype_name"

    rcode_names = {r.get("rcode_name") for r in records if r.get("rcode_name")}
    assert "NXDOMAIN" in rcode_names, "dns: 缺少 NXDOMAIN 响应"
    print(f"  [PASS] dns: {len(records)} 条, qtypes={qtypes}")


def verify_ssh(records):
    """SSH 日志验证：版本号交换"""
    assert len(records) > 0, "ssh: 无消息到达 Kafka"

    clients = [r.get("client") for r in records if r.get("client")]
    servers = [r.get("server") for r in records if r.get("server")]
    assert len(clients) > 0, "ssh: 缺少 client 版本"
    assert len(servers) > 0, "ssh: 缺少 server 版本"
    assert all("SSH-" in c for c in clients), "ssh: client 版本格式异常"
    print(f"  [PASS] ssh: {len(records)} 条, clients={len(clients)}, servers={len(servers)}")


def verify_ssl(records):
    """SSL/TLS 日志验证：版本、密码套件"""
    assert len(records) > 0, "ssl: 无消息到达 Kafka"

    versions = {r.get("version") for r in records if r.get("version")}
    assert len(versions) > 0, "ssl: 缺少 version 字段"

    ciphers = [r.get("cipher") for r in records if r.get("cipher")]
    assert len(ciphers) > 0, "ssl: 缺少 cipher 字段"

    snis = [r.get("server_name") for r in records if r.get("server_name")]
    print(f"  [PASS] ssl: {len(records)} 条, versions={versions}, sni_count={len(snis)}")


# ============================================================
# Kafka 消息解析
# ============================================================

SCENARIO_VERIFIERS = {
    "http_auth": verify_auth,
    "http_proxy": verify_proxy,
    "http_cookies": verify_cookies,
    "http_body": verify_body,
    "http_headers": verify_headers,
    "http_methods": verify_methods,
    "http_status": verify_status,
    "http_multicast": verify_multicast,
    "http_boundary_large_header": verify_boundary_large_header,
    "http_boundary_large_body": verify_boundary_large_body,
    "http_boundary_special_char": verify_boundary_special_char,
    "http_boundary_mixed_encoding": verify_boundary_mixed_encoding,
    "http_http_files": verify_http_files,
    "conn": verify_conn,
    "dns": verify_dns,
    "ssh": verify_ssh,
    "ssl": verify_ssl,
}


def extract_records(messages):
    """从 Kafka JSON 消息中提取记录。
    Kafka 插件 tag_json=T 时输出格式：{"stream_id": {fields...}}
    支持的 stream_id: http, conn, dns, ssh, ssl, files, ...
    """
    # 这些是 Zeek 元数据键，非日志流
    meta_keys = {"ts", "uid", "kind", "_scenario"}

    records = []
    for msg in messages:
        try:
            raw = msg.value.decode("utf-8") if isinstance(msg.value, bytes) else msg.value
            payload = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
            continue

        # 处理 tag_json 格式：找到第一个非元数据的子对象
        if isinstance(payload, dict):
            extracted = False
            for key, val in payload.items():
                if isinstance(val, dict) and key not in meta_keys:
                    records.append(val)
                    extracted = True
                    break
            if not extracted:
                # 直接是日志字段（无 tag_json）
                if payload.get("method") or payload.get("status_code") or payload.get("proto") or \
                   payload.get("query") or payload.get("client") or payload.get("version"):
                    records.append(payload)
    
    return records


def consume(broker, topic, timeout_ms=5000):
    """从 Kafka 消费消息"""
    if KafkaConsumer is None:
        raise ImportError("请安装 kafka-python: pip install kafka-python")
    
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=broker,
        auto_offset_reset="earliest",
        consumer_timeout_ms=timeout_ms,
        value_deserializer=lambda v: v.decode("utf-8") if v else None,
    )
    
    messages = []
    for msg in consumer:
        if msg.value:
            messages.append(msg)
    
    consumer.close()
    return messages


def main():
    parser = argparse.ArgumentParser(description="Kafka Zeek 日志验证")
    parser.add_argument("--broker", default="localhost:9092")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--scenario", required=True,
                        choices=list(SCENARIO_VERIFIERS.keys()))
    parser.add_argument("--timeout", type=int, default=5000,
                        help="Kafka consumer timeout in ms")
    args = parser.parse_args()
    
    print(f"[kafka-verify] 场景: {args.scenario}")
    print(f"[kafka-verify] broker: {args.broker}, topic: {args.topic}")
    
    # 消费 Kafka
    messages = consume(args.broker, args.topic, timeout_ms=args.timeout)
    records = extract_records(messages)
    
    print(f"[kafka-verify] 消费 {len(messages)} 条消息, 提取 {len(records)} 条 HTTP 记录")
    
    if len(records) == 0:
        # 重试一次，等待更长时间
        print("[kafka-verify] 首次未取到数据，重试...")
        import time
        time.sleep(3)
        messages = consume(args.broker, args.topic, timeout_ms=10000)
        records = extract_records(messages)
        print(f"[kafka-verify] 重试后: {len(messages)} 条消息, {len(records)} 条记录")
    
    # 执行场景化验证
    verifier = SCENARIO_VERIFIERS[args.scenario]
    try:
        verifier(records)
        print(f"[kafka-verify] ✅ {args.scenario} 通过")
        return 0
    except AssertionError as e:
        print(f"[kafka-verify] ❌ {args.scenario} 失败: {e}")
        return 1
    except Exception as e:
        print(f"[kafka-verify] ❌ {args.scenario} 异常: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())

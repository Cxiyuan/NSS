#!/usr/bin/env python3
"""
构造完整的 HTTP 流量（用于 Zeek HTTP 协议字段扩容测试）
支持生成：
- 完整的请求头（Authorization、XFF、Cookie、Content-Type 等）
- 完整的响应头和 body
- 写入 pcap 文件供 Zeek离线分析
- 直接发送 live 流量
"""

import argparse
import gzip
import random
import struct
import time
from datetime import datetime

from scapy.all import IP, TCP, Raw, send, wrpcap, conf

conf.verb = 0  # 静默 Scapy 输出


# ============================================================
# HTTP 测试数据
# ============================================================

HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]

REQUEST_HEADERS = [
    ("Host", "example.com"),
    ("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    ("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
    ("Accept-Encoding", "gzip, deflate, br"),
    ("Connection", "keep-alive"),
    ("Cache-Control", "no-cache"),
    ("Pragma", "no-cache"),
]

REQUEST_HEADERS_WITH_BODY = [
    ("Content-Type", "application/x-www-form-urlencoded"),
    ("Content-Length", None),  # 动态计算
    ("Origin", "https://example.com"),
    ("Referer", "https://example.com/login"),
]

RESPONSE_HEADERS = [
    ("Server", "Apache/2.4.41 (Unix) OpenSSL/1.1.1k"),
    ("Date", None),  # 动态填充
    ("Content-Type", "text/html; charset=UTF-8"),
    ("Content-Length", None),  # 动态计算
    ("Connection", "keep-alive"),
    ("Keep-Alive", "timeout=5, max=1000"),
    ("Cache-Control", "no-cache, no-store, must-revalidate"),
    ("Expires", "0"),
    ("Vary", "Accept-Encoding"),
]

SPECIAL_HEADERS = [
    ("Authorization", "Basic dXNlcm5hbWU6cGFzc3dvcmQ="),  # Basic 认证
    ("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),  # Bearer Token
    ("X-Forwarded-For", "203.0.113.195, 70.41.3.18, 150.172.238.178"),  # XFF 头
    ("X-Real-IP", "203.0.113.195"),
    ("X-Forwarded-Proto", "https"),
    ("X-Forwarded-Host", "example.com"),
    ("X-Forwarded-Port", "443"),
    ("Cookie", "sessionid=abc123; user_id=1001; csrf_token=xyz789"),
    ("Set-Cookie", "sessionid=abc123; Path=/; HttpOnly; Secure; SameSite=Strict"),
    ("X-Requested-With", "XMLHttpRequest"),
    ("X-CSRF-Token", "csrf-token-value-12345"),
    ("X-Api-Key", "sk-live-api-key-example"),
    ("Proxy-Authorization", "Basic cHJveHl1c2VyOnByb3h5cGFzcw=="),
    ("WWW-Authenticate", 'Basic realm="Restricted Area"'),
    ("Custom-Header", "custom-value"),
]

REQUEST_BODIES = [
    "username=admin&password=admin123&captcha=1234",
    "email=test@example.com&subscribe=true",
    "title=Hello%20World&content=This%20is%20a%20test%20post&tags=scapy%2Czeek",
    '{"username": "admin", "password": "admin123", "otp": "123456"}',
    '<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns:getUser xmlns:ns="http://example.com"><userId>12345</userId></ns:getUser></soap:Body></soap:Envelope>',
    "--bound123\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\nContent-Type: text/plain\r\n\r\nHello World\r\n--bound123--\r\n",
]

RESPONSE_BODIES = [
    "<html><head><title>Login Success</title></head><body><h1>Welcome, admin!</h1><p>Session: abc123</p></body></html>",
    '{"status": "success", "user_id": 1001, "token": "jwt-token-here", "expires_in": 3600}',
    '<?xml version="1.0"?><user><id>1001</id><name>admin</name><email>admin@example.com</email><roles><role>admin</role><role>user</role></roles></user>',
    "<html><head><title>Dashboard</title></head><body><h1>Admin Dashboard</h1><table border='1'><tr><th>Metric</th><th>Value</th></tr><tr><td>CPU</td><td>45%</td></tr><tr><td>Memory</td><td>2.1GB</td></tr></table></body></html>",
    "Error 403: Forbidden. CSRF token mismatch.",
]


# ============================================================
# 工具函数
# ============================================================

def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_port():
    return random.randint(49152, 65535)


def build_http_request(method, path, headers, body=None):
    """构造 HTTP 请求行和头部"""
    request_lines = [f"{method} {path} HTTP/1.1"]
    has_cl = False
    for k, v in headers:
        request_lines.append(f"{k}: {v}")
        if k.lower() == "content-length":
            has_cl = True
    if body and not has_cl:
        request_lines.append(f"Content-Length: {len(body)}")
    request_lines.append("")
    if body:
        request_lines.append(body)
    return "\r\n".join(request_lines)


def build_http_response(status_code, status_msg, headers, body=None):
    """构造 HTTP 响应行和头部"""
    response_lines = [f"HTTP/1.1 {status_code} {status_msg}"]
    has_cl = False
    for k, v in headers:
        if v is not None:
            response_lines.append(f"{k}: {v}")
            if k.lower() == "content-length":
                has_cl = True
    if body and not has_cl:
        response_lines.append(f"Content-Length: {len(body)}")
    response_lines.append("")
    if body:
        response_lines.append(body)
    return "\r\n".join(response_lines)


def tcp_handshake(src_ip, dst_ip, sport, dport):
    """执行 TCP 三次握手"""
    seq = random.randint(1000, 99999999)

    syn = IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq)
    send(syn)
    time.sleep(0.02)

    syn_ack = IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=random.randint(1000, 99999999), ack=seq + 1)
    send(syn_ack)
    time.sleep(0.02)

    ack = IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=seq + 1, ack=syn_ack.seq + 1)
    send(ack)

    return seq + 1, syn_ack.seq + 1


def send_packet(packet):
    """发送单个数据包"""
    send(packet)


def build_full_flow(client_ip, server_ip, sport, dport, http_req, http_resp_body,
                    status_code=200, status_msg="OK", resp_extra_headers=None):
    """构造完整 TCP 会话包列表（SYN -> HTTP请求 -> HTTP响应 -> FIN）"""
    packets = []
    seq = random.randint(1000, 99999999)
    # SYN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq))
    # SYN-ACK
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=seq+1))
    # ACK
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=seq+1, ack=syn_ack_seq+1))
    # HTTP Request
    client_seq = seq + 1
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=syn_ack_seq+1) / Raw(load=http_req))
    client_seq += len(http_req)
    # HTTP Response
    server_seq = syn_ack_seq + 1
    headers_for_resp = list(RESPONSE_HEADERS)
    date_str = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    headers_for_resp[1] = ("Date", date_str)
    if resp_extra_headers:
        headers_for_resp.extend(resp_extra_headers)
    http_resp = build_http_response(status_code, status_msg, headers_for_resp, http_resp_body)
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=server_seq, ack=client_seq) / Raw(load=http_resp))
    server_seq += len(http_resp)
    # FIN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq))
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_seq, ack=client_seq+1))
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq+1, ack=server_seq+1))
    return packets


# ============================================================
# HTTP 会话构造
# ============================================================

class HTTPFlow:
    """完整的 HTTP 请求-响应流"""

    def __init__(self, src_ip=None, dst_ip="192.168.1.100", sport=None, dport=80):
        self.src_ip = src_ip or random_ip()
        self.dst_ip = dst_ip
        self.sport = sport or random_port()
        self.dport = dport
        self.client_seq = None
        self.server_seq = None
        self.cookies = {}

    def build_request(self, method, path, extra_headers=None, body=None, auth_header=None, xff=True):
        """构造 HTTP 请求"""
        headers = list(REQUEST_HEADERS)

        if body:
            headers.extend(REQUEST_HEADERS_WITH_BODY)
        if extra_headers:
            headers.extend(extra_headers)
        if auth_header:
            headers.append(auth_header)
        if xff:
            headers.append(("X-Forwarded-For", f"{self.src_ip}, 10.0.0.1"))

        return build_http_request(method, path, headers, body)

    def build_response(self, status_code=200, status_msg="OK", extra_headers=None, body=None):
        """构造 HTTP 响应"""
        headers = list(RESPONSE_HEADERS)
        date_str = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        headers[1] = ("Date", date_str)

        if extra_headers:
            headers.extend(extra_headers)

        return build_http_response(status_code, status_msg, headers, body)

    def send_request(self, http_data, seq, ack):
        """发送 HTTP 请求数据包"""
        packet = (
            IP(src=self.src_ip, dst=self.dst_ip)
            / TCP(sport=self.sport, dport=self.dport, flags='PA', seq=seq, ack=ack)
            / Raw(load=http_data)
        )
        send(packet)
        return len(http_data)

    def send_response(self, http_data, seq, ack):
        """发送 HTTP 响应数据包"""
        packet = (
            IP(src=self.dst_ip, dst=self.src_ip)
            / TCP(sport=self.dport, dport=self.sport, flags='PA', seq=seq, ack=ack)
            / Raw(load=http_data)
        )
        send(packet)
        return len(http_data)

    def full_session(self, method="GET", path="/", body=None, auth_header=None, status_code=200, status_msg="OK", response_body=None, xff=True, pkt_list=None):
        """发送完整 HTTP 会话（包含 TCP 握手 + HTTP 请求响应 + 握手终结）"""

        # TCP 三次握手
        self.client_seq, self.server_seq = tcp_handshake(self.src_ip, self.dst_ip, self.sport, self.dport)

        # 构造 HTTP 请求
        http_req = self.build_request(method, path, body=body, auth_header=auth_header, xff=xff)

        # 发送请求
        self.send_request(http_req, self.client_seq, self.server_seq)
        self.client_seq += len(http_req)
        time.sleep(0.05)

        # 构造 HTTP 响应
        http_resp = self.build_response(status_code=status_code, status_msg=status_msg, body=response_body)
        self.send_response(http_resp, self.server_seq, self.client_seq)
        self.server_seq += len(http_resp)
        time.sleep(0.05)

        # 记录到 pkt_list（用于 pcap）
        if pkt_list is not None:
            pass  # Scapy send 不返回 packet 对象，改用独立构造

        print(f"  [{method}] {path} -> {status_code} {status_msg} | {len(http_resp)} bytes")


# ============================================================
# PCAP 写入支持
# ============================================================

def craft_http_session_pcap(session_count=1, output_file="http_traffic.pcap"):
    """生成包含完整 HTTP 流量的 pcap 文件"""
    packets = []

    # 生成一个随机 IP 对作为客户端-服务器
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    for i in range(session_count):
        session_sport = sport + i

        # 切换方法
        method = random.choice(HTTP_METHODS)
        path = random.choice(["/", "/login", "/api/users", "/api/data", "/dashboard", "/admin", "/search"])

        body = None
        auth_header = None
        response_body = random.choice(RESPONSE_BODIES)

        if method in ["POST", "PUT", "PATCH"]:
            body = random.choice(REQUEST_BODIES)
            if random.random() < 0.5:
                auth_header = random.choice([h for h in SPECIAL_HEADERS if h[0] == "Authorization"])

        if random.random() < 0.5:
            xff = True
        else:
            xff = False

        status_code = random.choice([200, 200, 200, 201, 204, 400, 401, 403, 404, 500])
        status_msg_map = {200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error"}
        status_msg = status_msg_map.get(status_code, "OK")

        flow = HTTPFlow(src_ip=client_ip, dst_ip=server_ip, sport=session_sport, dport=dport)
        http_req = flow.build_request(method, path, body=body, auth_header=auth_header, xff=xff)
        http_resp = flow.build_response(status_code=status_code, status_msg=status_msg, body=response_body)

        # TCP 三次握手包
        seq = random.randint(1000, 99999999)
        syn = IP(src=client_ip, dst=server_ip) / TCP(sport=session_sport, dport=dport, flags='S', seq=seq)
        packets.append(syn)

        syn_ack = IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=session_sport, flags='SA', seq=random.randint(1000, 99999999), ack=seq + 1)
        packets.append(syn_ack)

        ack = IP(src=client_ip, dst=server_ip) / TCP(sport=session_sport, dport=dport, flags='A', seq=seq + 1, ack=syn_ack.seq + 1)
        packets.append(ack)

        # HTTP 请求包
        client_seq = seq + 1
        http_req_pkt = IP(src=client_ip, dst=server_ip) / TCP(sport=session_sport, dport=dport, flags='PA', seq=client_seq, ack=syn_ack.seq + 1) / Raw(load=http_req)
        packets.append(http_req_pkt)
        client_seq += len(http_req)

        # HTTP 响应包
        server_seq = syn_ack.seq + 1
        http_resp_pkt = IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=session_sport, flags='PA', seq=server_seq, ack=client_seq) / Raw(load=http_resp)
        packets.append(http_resp_pkt)
        server_seq += len(http_resp)

        # TCP FIN 握手
        fin1 = IP(src=client_ip, dst=server_ip) / TCP(sport=session_sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq)
        packets.append(fin1)

        fin_ack = IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=session_sport, flags='FA', seq=server_seq, ack=client_seq + 1)
        packets.append(fin_ack)

        fin2 = IP(src=client_ip, dst=server_ip) / TCP(sport=session_sport, dport=dport, flags='A', seq=client_seq + 1, ack=server_seq + 1)
        packets.append(fin2)

        print(f"  [会话 {i+1}] {method} {path} -> {status_code}")

    wrpcap(output_file, packets)
    print(f"\n[✓] PCAP 文件已生成: {output_file} ({len(packets)} 个数据包)")


# ============================================================
# 场景化 PCAP 生成
# ============================================================

def generate_auth_pcap(output_file, session_count=3):
    """生成 Authorization 相关 HTTP 流量（Basic / Bearer / Proxy-Authorization）"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    auth_types = [
        ("Basic dXNlcm5hbWU6cGFzc3dvcmQ=", "Basic"),
        ("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c", "Bearer"),
        ("Basic cHJveHl1c2VyOnByb3h5cGFzcw==", "Proxy-Authorization"),
    ]

    for i in range(session_count):
        method = "GET" if i % 2 == 0 else "POST"
        auth_val, auth_type = auth_types[i % len(auth_types)]

        headers = list(REQUEST_HEADERS)
        headers.append(("Authorization", auth_val))

        body = "username=admin&password=admin123" if method == "POST" else None
        http_req = build_http_request(method, "/api/" + ("login" if method == "POST" else "users"), headers, body)

        resp_body = random.choice(RESPONSE_BODIES)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] auth: {output_file} ({len(packets)} packets)")


def generate_proxy_pcap(output_file, session_count=3):
    """生成代理相关 HTTP 流量（X-Forwarded-For、X-Real-IP、X-Forwarded-Proto、X-Forwarded-Host）"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    proxy_headers = [
        ("X-Forwarded-For", "203.0.113.195, 70.41.3.18, 150.172.238.178"),
        ("X-Real-IP", "203.0.113.195"),
        ("X-Forwarded-Proto", "https"),
        ("X-Forwarded-Host", "example.com"),
    ]

    for i in range(session_count):
        headers = list(REQUEST_HEADERS)
        headers.extend(proxy_headers)
        http_req = build_http_request("GET", "/api/proxy", headers)

        resp_body = random.choice(RESPONSE_BODIES)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] proxy: {output_file} ({len(packets)} packets)")


def generate_cookies_pcap(output_file, session_count=3):
    """生成 Cookie / Set-Cookie HTTP 流量（HttpOnly、Secure、SameSite 属性）"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    for i in range(session_count):
        method = "GET" if i % 2 == 0 else "POST"

        # 请求头含 Cookie
        req_headers = list(REQUEST_HEADERS)
        req_headers.append(("Cookie", "sessionid=abc123; user_id=1001; csrf_token=xyz789"))

        # 响应头含 Set-Cookie
        set_cookie = "sessionid=abc123; Path=/; HttpOnly; Secure; SameSite=Strict"
        resp_extra_headers = [("Set-Cookie", set_cookie)]

        http_req = build_http_request(method, "/api/cookies", req_headers)
        resp_body = random.choice(RESPONSE_BODIES)

        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport,
                                       http_req, resp_body, 200, "OK",
                                       resp_extra_headers=resp_extra_headers))

    wrpcap(output_file, packets)
    print(f"[+] cookies: {output_file} ({len(packets)} packets)")


def generate_body_pcap(output_file, session_count=3):
    """生成 4 种 Content-Type 的 HTTP POST 流量"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    content_types = [
        ("application/json", '{"username": "admin", "password": "admin123"}'),
        ("application/x-www-form-urlencoded", "username=admin&password=admin123"),
        ("text/xml", '<?xml version="1.0"?><user><id>12345</id></user>'),
        ("multipart/form-data", "--bound123\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\nContent-Type: text/plain\r\n\r\nHello World\r\n--bound123--\r\n"),
    ]

    for i, (ct, body) in enumerate(content_types):
        headers = list(REQUEST_HEADERS)
        headers.append(("Content-Type", ct))
        http_req = build_http_request("POST", "/api/upload", headers, body)

        resp_body = random.choice(RESPONSE_BODIES)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] body: {output_file} ({len(packets)} packets)")


def generate_headers_pcap(output_file, session_count=3):
    """生成完整标准请求/响应头的 HTTP 流量"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    for i in range(session_count):
        method = "GET" if i % 2 == 0 else "POST"

        # 请求头固定包含
        req_headers = [
            ("Host", "example.com"),
            ("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"),
            ("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
            ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
            ("Accept-Encoding", "gzip, deflate, br"),
            ("Connection", "keep-alive"),
            ("Cache-Control", "no-cache"),
            ("Pragma", "no-cache"),
            ("Origin", "https://example.com"),
            ("Referer", "https://example.com/login"),
        ]
        body = "username=admin&password=admin123" if method == "POST" else None
        http_req = build_http_request(method, "/api/headers", req_headers, body)

        # 响应头固定包含（排除 Date，由 build_full_flow 自动填充）
        resp_extra_headers = [
            ("Server", "Apache/2.4.41"),
            ("Content-Type", "application/json; charset=UTF-8"),
            ("Connection", "keep-alive"),
            ("Keep-Alive", "timeout=5, max=1000"),
            ("Cache-Control", "no-cache, no-store, must-revalidate"),
            ("Expires", "0"),
            ("Vary", "Accept-Encoding"),
        ]

        resp_body = random.choice(RESPONSE_BODIES)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport,
                                       http_req, resp_body, 200, "OK",
                                       resp_extra_headers=resp_extra_headers))

    wrpcap(output_file, packets)
    print(f"[+] headers: {output_file} ({len(packets)} packets)")


def generate_methods_pcap(output_file, session_count=1):
    """生成 GET、POST、PUT、DELETE、HEAD、OPTIONS 方法的 HTTP 流量"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]
    bodies = {
        "GET": None,
        "POST": '{"username": "admin"}',
        "PUT": '{"name": "updated"}',
        "DELETE": None,
        "HEAD": None,
        "OPTIONS": None,
    }

    for i, method in enumerate(methods):
        body = bodies[method]
        headers = list(REQUEST_HEADERS)
        if body:
            headers.append(("Content-Type", "application/json"))
        http_req = build_http_request(method, "/api/methods", headers, body)

        resp_body = random.choice(RESPONSE_BODIES) if method != "HEAD" else None
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] methods: {output_file} ({len(packets)} packets)")


def generate_status_pcap(output_file, session_count=1):
    """生成多种 HTTP 状态码的流量"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    status_codes = [200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503]
    status_msgs = {
        200: "OK", 201: "Created", 204: "No Content",
        301: "Moved Permanently", 302: "Found",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
        500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
    }

    for i, code in enumerate(status_codes):
        headers = list(REQUEST_HEADERS)
        http_req = build_http_request("GET", f"/api/status/{code}", headers)

        resp_body = "Error occurred" if code >= 400 else random.choice(RESPONSE_BODIES)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, code, status_msgs[code]))

    wrpcap(output_file, packets)
    print(f"[+] status: {output_file} ({len(packets)} packets)")


def generate_boundary_large_header_pcap(output_file, session_count=1):
    """生成超大 Header（>8KB）的 HTTP 请求"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    headers = list(REQUEST_HEADERS)
    # 添加超大 Header（9000 字节）
    large_value = "A" * 9000
    headers.append(("X-Large-Header", large_value))

    http_req = build_http_request("GET", "/api/large-header", headers)
    resp_body = random.choice(RESPONSE_BODIES)
    packets.extend(build_full_flow(client_ip, server_ip, sport, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] boundary_large_header: {output_file} ({len(packets)} packets)")


def generate_boundary_large_body_pcap(output_file, session_count=1):
    """生成超大 Body（>10MB）的 HTTP POST 请求"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    # 构造 HTTP 请求头（不包含 body，body 在后续数据块中）
    headers = list(REQUEST_HEADERS)
    headers.append(("Content-Type", "application/octet-stream"))
    # 12MB body，分块发送
    large_body = "X" * (12 * 1024 * 1024)
    body_bytes = large_body.encode('latin-1')

    # 先发送请求头（带 Content-Length）
    req_start = f"POST /api/large-body HTTP/1.1\r\n"
    for k, v in headers:
        req_start += f"{k}: {v}\r\n"
    req_start += f"Content-Length: {len(body_bytes)}\r\n"
    req_start += "\r\n"

    seq = random.randint(1000, 99999999)
    # SYN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq))
    # SYN-ACK
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=seq+1))
    # ACK
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=seq+1, ack=syn_ack_seq+1))

    # 发送 HTTP 请求头
    client_seq = seq + 1
    http_req_start = req_start.encode('latin-1')
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=syn_ack_seq+1) / Raw(load=http_req_start))
    client_seq += len(http_req_start)

    # 分块发送 body（每块 64KB），Scapy IP 层限制 total length <= 65535
    chunk_size = 65000
    for i in range(0, len(body_bytes), chunk_size):
        chunk = body_bytes[i:i+chunk_size]
        last_chunk = (i + chunk_size >= len(body_bytes))
        flags = 'PA' if last_chunk else 'A'
        packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags=flags, seq=client_seq, ack=syn_ack_seq+1) / Raw(load=chunk))
        client_seq += len(chunk)

    # HTTP 响应
    server_seq = syn_ack_seq + 1
    resp_body = b"Upload received"
    headers_for_resp = list(RESPONSE_HEADERS)
    date_str = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    headers_for_resp[1] = ("Date", date_str)
    http_resp = build_http_response(200, "OK", headers_for_resp, resp_body.decode('latin-1') if isinstance(resp_body, bytes) else resp_body)
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=server_seq, ack=client_seq) / Raw(load=http_resp))
    server_seq += len(http_resp)

    # FIN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq))
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_seq, ack=client_seq+1))
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq+1, ack=server_seq+1))

    wrpcap(output_file, packets)
    print(f"[+] boundary_large_body: {output_file} ({len(packets)} packets)")


def generate_boundary_special_char_pcap(output_file, session_count=1):
    """生成 Header/Body 含特殊字符的 HTTP 流量"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    test_cases = [
        ("Chinese", "你好世界"),
        ("Emoji", "😀😁"),
        ("NullByte", "\x00"),
    ]

    for i, (name, value) in enumerate(test_cases):
        headers = list(REQUEST_HEADERS)
        headers.append(("X-Special-Char", value))

        # 响应体也含特殊字符
        resp_body = f"Response with {name}: {value}"
        http_req = build_http_request("GET", f"/api/special/{name.lower()}", headers)
        packets.extend(build_full_flow(client_ip, server_ip, sport + i, dport, http_req, resp_body, 200, "OK"))

    wrpcap(output_file, packets)
    print(f"[+] boundary_special_char: {output_file} ({len(packets)} packets)")


def generate_boundary_mixed_encoding_pcap(output_file, session_count=1):
    """生成 Content-Encoding: gzip + chunked transfer encoding 的 HTTP 响应"""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()
    sport = random_port()
    dport = 80

    # 压缩 "Hello World"
    original_body = b"Hello World"
    compressed_body = gzip.compress(original_body)

    headers = list(REQUEST_HEADERS)
    http_req = build_http_request("GET", "/api/gzip", headers)

    # 构造完整的 TCP 流程
    seq = random.randint(1000, 99999999)
    # SYN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq))
    # SYN-ACK
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=seq+1))
    # ACK
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=seq+1, ack=syn_ack_seq+1))

    # HTTP Request
    client_seq = seq + 1
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=syn_ack_seq+1) / Raw(load=http_req.encode('latin-1')))
    client_seq += len(http_req)

    # HTTP Response (gzip + chunked)
    server_seq = syn_ack_seq + 1
    http_resp = (
        "HTTP/1.1 200 OK\r\n"
        "Server: Apache/2.4.41\r\n"
        f"Date: {datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT')}\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Encoding: gzip\r\n"
        "Transfer-Encoding: chunked\r\n"
        "\r\n"
    )
    # Chunked body: first chunk
    chunk_size_line = f"{len(compressed_body):x}\r\n".encode('latin-1')
    chunk_data = compressed_body
    chunk_end = b"\r\n0\r\n\r\n"
    full_resp = http_resp.encode('latin-1') + chunk_size_line + chunk_data + b"\r\n" + chunk_end

    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=server_seq, ack=client_seq) / Raw(load=full_resp))
    server_seq += len(full_resp)

    # FIN
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq))
    packets.append(IP(src=server_ip, dst=client_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_seq, ack=client_seq+1))
    packets.append(IP(src=client_ip, dst=server_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq+1, ack=server_seq+1))

    wrpcap(output_file, packets)
    print(f"[+] boundary_mixed_encoding: {output_file} ({len(packets)} packets)")


def generate_pcap(scenario="auth", output_file="http_auth.pcap", session_count=3):
    """统一入口"""
    scenarios = {
        "auth": generate_auth_pcap,
        "proxy": generate_proxy_pcap,
        "cookies": generate_cookies_pcap,
        "body": generate_body_pcap,
        "headers": generate_headers_pcap,
        "methods": generate_methods_pcap,
        "status": generate_status_pcap,
        "boundary_large_header": generate_boundary_large_header_pcap,
        "boundary_large_body": generate_boundary_large_body_pcap,
        "boundary_special_char": generate_boundary_special_char_pcap,
        "boundary_mixed_encoding": generate_boundary_mixed_encoding_pcap,
    }
    scenarios[scenario](output_file, session_count)


# ============================================================
# Live 流量发送
# ============================================================

def craft_http_session_live(session_count=5, delay=0.5):
    """发送 HTTP 流量（直接发送，不写 pcap）"""
    print(f"=== 开始构造 {session_count} 个 HTTP 会话 (Live) ===\n")

    for i in range(session_count):
        flow = HTTPFlow()
        method = random.choice(HTTP_METHODS)
        path = random.choice(["/", "/login", "/api/users", "/api/data", "/dashboard", "/admin", "/search", "/submit"])

        body = None
        auth_header = None
        response_body = random.choice(RESPONSE_BODIES)

        if method in ["POST", "PUT", "PATCH"]:
            body = random.choice(REQUEST_BODIES)
            if random.random() < 0.5:
                auth_header = random.choice([h for h in SPECIAL_HEADERS if h[0] == "Authorization"])

        status_code = random.choice([200, 200, 200, 201, 204, 400, 401, 403, 404, 500])
        status_msg_map = {200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error"}
        status_msg = status_msg_map.get(status_code, "OK")

        flow.full_session(
            method=method,
            path=path,
            body=body,
            auth_header=auth_header,
            status_code=status_code,
            status_msg=status_msg,
            response_body=response_body,
            xff=True,
        )

        time.sleep(delay)

    print("\n=== 所有会话构造完成 ===")


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="构造完整 HTTP 流量用于 Zeek 测试")
    parser.add_argument("-s", "--scenario", type=str, default="auth",
                        choices=["auth", "proxy", "cookies", "body", "headers", "methods", "status",
                                 "boundary_large_header", "boundary_large_body", "boundary_special_char",
                                 "boundary_mixed_encoding"],
                        help="测试场景")
    parser.add_argument("-o", "--output", type=str, default="output.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_pcap(args.scenario, args.output, args.count)
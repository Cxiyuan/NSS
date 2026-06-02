#!/usr/bin/env python3
"""Generate PCAPs for additional protocols: ftp, rdp, smb, mysql, postgresql, redis, sip, snmp.

Each creates a minimal valid TCP/UDP session that Zeek's protocol analyzer can detect.
"""
import argparse
import struct
from scapy.all import IP, TCP, UDP, Raw, wrpcap, conf
conf.verb = 0

def tcp_session(port, client_after_ack=b"", client_after_server=b"", server_after_client=b"", server_first=b"", sport=50000):
    """
    Build a TCP session with configurable exchange order:
    1. TCP handshake
    2. If server_first: server sends first
    3. Client ACKs server_first
    4. Client sends message A (client_after_ack)
    5. Server ACKs + responds (server_after_client)
    6. Client ACKs + sends message B (client_after_server)
    7. Server ACKs
    8. FIN
    """
    pkts = []
    src_ip, dst_ip = "10.10.10.1", "10.10.10.2"
    dport = port
    seq, ack_seq = 1000, 2000
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=port, flags='S', seq=seq))
    pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='SA', seq=ack_seq, ack=seq+1))
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=seq+1, ack=ack_seq+1))
    c_seq, s_seq = seq+1, ack_seq+1

    # Server-first data (e.g. FTP banner, MySQL greeting)
    if server_first:
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='PA', seq=s_seq, ack=c_seq)/Raw(load=server_first))
        s_seq += len(server_first)
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=c_seq, ack=s_seq))

    # Client sends first data
    if client_after_ack:
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='PA', seq=c_seq, ack=s_seq)/Raw(load=client_after_ack))
        c_seq += len(client_after_ack)
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='A', seq=s_seq, ack=c_seq))

    # Server responds
    if server_after_client:
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='PA', seq=s_seq, ack=c_seq)/Raw(load=server_after_client))
        s_seq += len(server_after_client)
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=c_seq, ack=s_seq))

    # Client sends second data
    if client_after_server:
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='PA', seq=c_seq, ack=s_seq)/Raw(load=client_after_server))
        c_seq += len(client_after_server)
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='A', seq=s_seq, ack=c_seq))

    # FIN
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='FA', seq=c_seq, ack=s_seq))
    pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='FA', seq=s_seq, ack=c_seq+1))
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=c_seq+1, ack=s_seq+1))
    return pkts


# ---- FTP (21/tcp) ----
def create_ftp_pcap(path):
    """FTP: server banner → USER → server OK → PASS → server OK (correct order)."""
    banner = b"220 FTP server ready.\r\n"
    ok = b"230 Login successful.\r\n"
    user = b"USER testuser\r\n"
    passw = b"PASS testpass\r\n"
    pkts = tcp_session(21, server_first=banner, client_after_ack=user, server_after_client=ok)
    wrpcap(path, pkts)
    print(f"[+] ftp: {path}")

# ---- RDP (3389/tcp) ----
def create_rdp_pcap(path):
    """RDP: TPKT-COTP + RDP Negotiation Request + server response."""
    # TPKT header + COTP Connection Request
    tpkt = struct.pack(">BBH", 3, 0, 11)  # version=3, reserved=0, len=11
    cotp = struct.pack("BBH", 0x01, 0x00, 0x08)  # COTP CR, dst-ref=0, src-ref=0
    cotp += struct.pack("BB", 0x00, 0x00)  # class=0
    # RDP Negotiation Request
    rdp_req = struct.pack("BBH", 0x01, 0x00, 0x08)  # type=RDP_NEG_REQ, flags=0, len=8
    rdp_req += struct.pack(">I", 0x00000003)  # requestedProtocols = SSL + RDP
    # Server Response: TPKT + COTP CC + RDP Negotiation Response
    rdp_resp = struct.pack("BBH", 0x03, 0x00, 0x0b)  # TPKT
    rdp_resp += struct.pack("BBH", 0x02, 0x00, 0x08)  # COTP CC
    rdp_resp += struct.pack("BBH", 0x02, 0x00, 0x08)  # RDP_NEG_RSP
    rdp_resp += struct.pack(">I", 0x00000001)  # selectedProtocol = RDP
    pkts = tcp_session(3389, client_after_ack=tpkt+cotp+rdp_req, server_after_client=rdp_resp)
    wrpcap(path, pkts)
    print(f"[+] rdp: {path}")

# ---- SMB (445/tcp) ----
def create_smb_pcap(path):
    """SMB: SMBv2 Negotiate Protocol Request + Response."""
    # SMBv2 Negotiate Request (wrapped in NetBIOS session header)
    smb_req = struct.pack(">I", 64)  # NetBIOS session message length
    smb_req += b"\xfe\x53\x4d\x42"  # SMBv2 protocol ID
    smb_req += struct.pack("<H", 64)  # StructureSize
    smb_req += struct.pack("<H", 0)  # DialectCount = 0
    smb_req += struct.pack("<H", 0)  # SecurityMode
    smb_req += struct.pack("<I", 0)  # Reserved
    smb_req += b"\x00" * 8  # Capabilities
    smb_req += b"\x00" * 16  # ClientGuid
    smb_req += b"\x00" * 4  # NegotiateContextOffset
    smb_req += struct.pack("<H", 0)  # NegotiateContextCount
    smb_req += b"\x00" * 2  # Reserved2
    # SMBv2 Negotiate Response (minimal)
    smb_resp = struct.pack(">I", 96)  # NetBIOS
    smb_resp += b"\xfe\x53\x4d\x42"
    smb_resp += struct.pack("<H", 65)  # StructureSize
    smb_resp += struct.pack("<H", 0x02ff)  # SecurityMode
    smb_resp += struct.pack("<H", 0x02ff)  # DialectRevision = SMB 3.1.1
    smb_resp += b"\x00" * 2  # Reserved
    smb_resp += b"\x00" * 8  # ServerGuid
    smb_resp += b"\x00" * 8  # Capabilities
    smb_resp += b"\x00" * 4  # MaxTransactSize
    smb_resp += b"\x00" * 4  # MaxReadSize
    smb_resp += b"\x00" * 4  # MaxWriteSize
    smb_resp += b"\x00" * 8  # SystemTime
    smb_resp += b"\x00" * 4  # ServerStartTime
    smb_resp += b"\x00" * 16  # SecurityBuffer
    pkts = tcp_session(445, client_after_ack=smb_req, server_after_client=smb_resp)
    wrpcap(path, pkts)
    print(f"[+] smb: {path}")

# ---- MySQL (3306/tcp) ----
def create_mysql_pcap(path):
    """MySQL: server greeting → client login (correct order)."""
    greeting = struct.pack("B", 10)  # protocol version
    greeting += b"8.0.32\x00"  # server version
    greeting += struct.pack(">I", 123456)  # connection id
    greeting += b"abcdefgh"  # auth-plugin-data-part-1
    greeting += b"\x00"  # filler
    greeting += struct.pack("<H", 0xffff)  # capability flags
    greeting += struct.pack("B", 33)  # character set
    greeting += struct.pack("<H", 0)  # status flags
    greeting += struct.pack("B", 0x0f)  # capability flags upper
    greeting += struct.pack("B", 21)  # auth-plugin-data-len
    greeting += b"\x00" * 10  # reserved
    greeting += b"ijklmnopqrstuvwxyz\x00"  # auth-plugin-data-part-2
    greeting += b"mysql_native_password\x00"  # auth plugin name

    # Wrap in MySQL packet header: length(3) + seq(1)
    pkt_len = len(greeting)
    greeting_pkt = struct.pack("<I", pkt_len)[:3] + struct.pack("B", 0) + greeting

    # Client login response
    client = struct.pack("<I", 0x00000801)  # capability
    client += struct.pack("<I", 16777215)  # max packet size
    client += struct.pack("B", 33)  # charset
    client += b"\x00" * 23  # reserved
    client += b"testuser\x00"  # username
    client += b"\x14" + b"0123456789abcdef"  # auth-response length + data
    client += b"mysql_native_password\x00"  # auth plugin
    client_pkt = struct.pack("<I", len(client))[:3] + struct.pack("B", 1) + client

    pkts = tcp_session(3306, server_first=greeting_pkt, client_after_ack=client_pkt)
    wrpcap(path, pkts)
    print(f"[+] mysql: {path}")

# ---- PostgreSQL (5432/tcp) ----
def create_postgresql_pcap(path):
    """PostgreSQL: client StartupMessage → server AuthenticationOK."""
    startup = struct.pack(">II", 8 + 4 + 5 + 4 + 4 + 1, 196608)  # len, protocol 3.0
    startup += b"user\x00testuser\x00database\x00testdb\x00\x00"
    # Wrap in PG message format
    pg_msg = struct.pack(">cI", b"\x00", 4 + len(startup)) + startup
    # Server auth OK
    auth_ok = struct.pack(">cI", b"R", 8) + struct.pack(">I", 0)  # AuthenticationOk
    pkts = tcp_session(5432, client_after_ack=pg_msg, server_after_client=auth_ok)
    wrpcap(path, pkts)
    print(f"[+] postgresql: {path}")

# ---- Redis (6379/tcp) ----
def create_redis_pcap(path):
    """Redis: inline PING + server PONG reply."""
    cmd = b"PING\r\n"
    reply = b"+PONG\r\n"
    pkts = tcp_session(6379, client_after_ack=cmd, server_after_client=reply)
    wrpcap(path, pkts)
    print(f"[+] redis: {path}")

# ---- SIP (5060/tcp) ----
def create_sip_pcap(path):
    """SIP: INVITE request + 200 OK."""
    req = b"INVITE sip:1000@example.com SIP/2.0\r\nVia: SIP/2.0/TCP 10.10.10.1:5060;branch=z9hG4bK12345\r\nFrom: <sip:user@example.com>;tag=abc\r\nTo: <sip:1000@example.com>\r\nCall-ID: 12345@10.10.10.1\r\nCSeq: 1 INVITE\r\nContact: <sip:user@10.10.10.1>\r\nMax-Forwards: 70\r\nContent-Type: application/sdp\r\nContent-Length: 0\r\n\r\n"
    resp = b"SIP/2.0 200 OK\r\nVia: SIP/2.0/TCP 10.10.10.1:5060;branch=z9hG4bK12345\r\nFrom: <sip:user@example.com>;tag=abc\r\nTo: <sip:1000@example.com>;tag=def\r\nCall-ID: 12345@10.10.10.1\r\nCSeq: 1 INVITE\r\nContact: <sip:1000@10.10.10.2>\r\nContent-Type: application/sdp\r\nContent-Length: 0\r\n\r\n"
    pkts = tcp_session(5060, client_after_ack=req, server_after_client=resp)
    wrpcap(path, pkts)
    print(f"[+] sip: {path}")

# ---- SNMP (161/udp) ----
def create_snmp_pcap(path):
    """SNMPv2c: GetRequest + Response (valid BER encoding)."""
    # SNMPv2c GetRequest for sysDescr.0 - manually BER-encoded
    # Version: 1 (v2c)
    version = b"\x02\x01\x01"
    community = b"\x04\x06public"
    # GetRequest PDU (type 0xa0)
    req_id = b"\x02\x02\x2a\x2a"  # request-id = 10794
    error = b"\x02\x01\x00"
    error_idx = b"\x02\x01\x00"
    # Varbind: sysDescr.0 (1.3.6.1.2.1.1.1.0) = NULL
    oid = b"\x06\x08\x2b\x06\x01\x02\x01\x01\x01\x00"  # 1.3.6.1.2.1.1.1.0
    val = b"\x05\x00"  # NULL
    varbind = b"\x30\x0c" + oid + val
    varbind_list = b"\x30\x0e" + varbind
    pdu_body = req_id + error + error_idx + varbind_list
    pdu = b"\xa0" + bytes([len(pdu_body)]) + pdu_body
    snmp_req = b"\x30" + bytes([len(version + community + pdu)]) + version + community + pdu

    # Response PDU (type 0xa2)
    resp_body = b"\x02\x02\x2a\x2a" + b"\x02\x01\x00" + b"\x02\x01\x00"
    resp_var = b"\x30\x0c" + oid + b"\x04\x05Hello!"
    resp_vbl = b"\x30\x0e" + resp_var
    resp_pdu = b"\xa2" + bytes([len(resp_body + resp_vbl)]) + resp_body + resp_vbl
    snmp_resp = b"\x30" + bytes([len(version + community + resp_pdu)]) + version + community + resp_pdu

    pkts = []
    src_ip, dst_ip = "10.10.10.1", "10.10.10.2"
    pkts.append(IP(src=src_ip, dst=dst_ip)/UDP(sport=50000, dport=161)/Raw(load=snmp_req))
    pkts.append(IP(src=dst_ip, dst=src_ip)/UDP(sport=161, dport=50000)/Raw(load=snmp_resp))
    wrpcap(path, pkts)
    print(f"[+] snmp: {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-o", "--output", type=str, default="pcap")
    args = parser.parse_args()
    out = args.output.rstrip("/")
    create_ftp_pcap(f"{out}/ftp.pcap")
    create_rdp_pcap(f"{out}/rdp.pcap")
    create_smb_pcap(f"{out}/smb.pcap")
    create_mysql_pcap(f"{out}/mysql.pcap")
    create_postgresql_pcap(f"{out}/postgresql.pcap")
    create_redis_pcap(f"{out}/redis.pcap")
    create_sip_pcap(f"{out}/sip.pcap")
    create_snmp_pcap(f"{out}/snmp.pcap")
    print(f"[OK] generated 8 protocol pcaps in {out}/")

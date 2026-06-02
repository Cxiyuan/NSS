#!/usr/bin/env python3
"""Generate PCAPs for additional protocols: ftp, rdp, smb, mysql, postgresql, redis, sip, snmp.

Each creates a minimal valid TCP/UDP session that Zeek's protocol analyzer can detect.
"""
import argparse
import struct
from scapy.all import IP, TCP, UDP, Raw, wrpcap, conf
conf.verb = 0

def session(port, client_payload=b"", server_payload=b""):
    """Build a TCP session: handshake → client data → server data → FIN."""
    pkts = []
    src_ip, dst_ip = "10.10.10.1", "10.10.10.2"
    sport, dport = 50000, port
    seq, ack_seq = 1000, 2000
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='S', seq=seq))
    pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='SA', seq=ack_seq, ack=seq+1))
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=seq+1, ack=ack_seq+1))
    c_seq, s_seq = seq+1, ack_seq+1
    if client_payload:
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='PA', seq=c_seq, ack=s_seq)/Raw(load=client_payload))
        c_seq += len(client_payload)
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='A', seq=s_seq, ack=c_seq))
    if server_payload:
        pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='PA', seq=s_seq, ack=c_seq)/Raw(load=server_payload))
        s_seq += len(server_payload)
        pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=c_seq, ack=s_seq))
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='FA', seq=c_seq, ack=s_seq))
    pkts.append(IP(src=dst_ip, dst=src_ip)/TCP(sport=dport, dport=sport, flags='FA', seq=s_seq, ack=c_seq+1))
    pkts.append(IP(src=src_ip, dst=dst_ip)/TCP(sport=sport, dport=dport, flags='A', seq=c_seq+1, ack=s_seq+1))
    return pkts

def udp_session(port, client_payload=b"", server_payload=b""):
    """Build a UDP datagram exchange."""
    pkts = []
    src_ip, dst_ip = "10.10.10.1", "10.10.10.2"
    pkts.append(IP(src=src_ip, dst=dst_ip)/UDP(sport=50000, dport=port)/Raw(load=client_payload))
    if server_payload:
        pkts.append(IP(src=dst_ip, dst=src_ip)/UDP(sport=port, dport=50000)/Raw(load=server_payload))
    return pkts

# ---- FTP (21/tcp) ----
def create_ftp_pcap(path):
    """FTP: server banner → USER → PASS → login OK."""
    banner = b"220 FTP server ready\r\n"
    user = b"USER testuser\r\n"
    passw = b"PASS testpass\r\n"
    ok = b"230 Login successful\r\n"
    pkts = session(21, client_payload=user, server_payload=banner)
    c, s = pkts[-1][TCP].seq, pkts[-1][TCP].ack  # continue after login
    pkts.extend(session(21, passw, ok)[3:])
    wrpcap(path, pkts)
    print(f"[+] ftp: {path}")

# ---- RDP (3389/tcp) ----
def create_rdp_pcap(path):
    """RDP: TPKT + RDP Connection Request."""
    # TPKT header (3 bytes) + RDP Connection Request (RDP_NEG_REQ)
    tpkt = struct.pack(">BBH", 3, 0, 11)
    rdp_req = struct.pack("BBH", 0x01, 0x00, 0x08)  # type=RDP_NEG_REQ, flags=0, length=8
    rdp_req += struct.pack(">I", 0x00000001)  # requestedProtocols = RDP_NEG_RDP
    pkts = session(3389, client_payload=tpkt+rdp_req)
    wrpcap(path, pkts)
    print(f"[+] rdp: {path}")

# ---- SMB (445/tcp) ----
def create_smb_pcap(path):
    """SMB: SMBv2 Negotiate Protocol Request."""
    # SMBv2 header (64 bytes)
    smb = struct.pack(">I", 0xfe534d42)  # 0xfeSMB (Protocol ID)
    smb += struct.pack("BBH", 0x00, 0x00, 0x00)  # StructureSize + CreditCharge
    smb += struct.pack(">I", 0x00000000)  # Status
    smb += struct.pack("B", 0x18)  # Command = Negotiate
    smb += struct.pack("B", 0x00)  # Credits
    smb += struct.pack("B", 0x00)  # Flags
    smb += struct.pack(">I", 0x00000000)  # NextCommand
    smb += struct.pack("B", 0x00)  # MessageId
    smb += b"\x00" * 7
    smb += struct.pack(">I", 0x00000000)  # TreeId
    smb += b"\x00" * 8  # SessionId
    smb += b"\x00" * 16  # Signature
    wrpcap(path, session(445, client_payload=smb))
    print(f"[+] smb: {path}")

# ---- MySQL (3306/tcp) ----
def create_mysql_pcap(path):
    """MySQL: server greeting → client login."""
    # Server greeting (Protocol 10 handshake)
    greeting = struct.pack("B", 10)  # protocol version
    greeting += b"8.0.32\x00"  # server version
    greeting += struct.pack(">I", 123456)  # connection id
    greeting += b"abcdefgh"  # auth-plugin-data-part-1 (8 bytes)
    greeting += b"\x00"  # filler
    greeting += b"\xff\xff\xff"  # capability flags (lower 2 bytes)
    greeting += struct.pack("B", 33)  # character set
    greeting += struct.pack(">H", 0)  # status flags
    greeting += struct.pack("B", 0x0f)  # capability flags (upper)
    greeting += struct.pack("B", 0)  # length of auth-plugin-data
    greeting += b"\x00" * 10  # reserved
    greeting += b"ijklmnopqrstuvwxyz"  # auth-plugin-data-part-2 (12 bytes)
    greeting += b"\x00"  # null terminator
    greeting += b"mysql_native_password\x00"  # auth plugin name
    client = struct.pack(">I", 0x00000801)  # capability
    client += struct.pack(">I", 0x00000000)  # max packet size
    client += struct.pack("B", 33)  # charset
    client += b"\x00" * 23  # reserved
    client += b"testuser\x00"  # username
    pkts = session(3306, server_payload=greeting, client_payload=client)
    wrpcap(path, pkts)
    print(f"[+] mysql: {path}")

# ---- PostgreSQL (5432/tcp) ----
def create_postgresql_pcap(path):
    """PostgreSQL: StartupMessage → AuthenticationMD5Password."""
    # StartupMessage (protocol 3.0)
    startup = struct.pack(">I", 0)  # length placeholder
    startup = struct.pack(">II", 8 + 32, 196608)  # length=40, protocol=3.0
    startup += b"user\x00testuser\x00database\x00testdb\x00\x00"
    # Server response: AuthenticationMD5Password
    auth = struct.pack(">cII", b"R", 12, 5)  # type=R, length=12, type=MD5
    auth += b"0123456789abcdef"  # salt (16 bytes)
    pkts = session(5432, client_payload=startup, server_payload=auth)
    wrpcap(path, pkts)
    print(f"[+] postgresql: {path}")

# ---- Redis (6379/tcp) ----
def create_redis_pcap(path):
    """Redis: inline command + server reply."""
    cmd = b"PING\r\n"
    reply = b"+PONG\r\n"
    pkts = session(6379, client_payload=cmd, server_payload=reply)
    wrpcap(path, pkts)
    print(f"[+] redis: {path}")

# ---- SIP (5060/tcp) ----
def create_sip_pcap(path):
    """SIP: REGISTER request + 200 OK."""
    req = b"REGISTER sip:example.com SIP/2.0\r\nVia: SIP/2.0/TCP 10.10.10.1:5060\r\nFrom: <sip:user@example.com>\r\nTo: <sip:user@example.com>\r\nCall-ID: 12345@10.10.10.1\r\nCSeq: 1 REGISTER\r\nMax-Forwards: 70\r\nContent-Length: 0\r\n\r\n"
    resp = b"SIP/2.0 200 OK\r\nVia: SIP/2.0/TCP 10.10.10.1:5060\r\nFrom: <sip:user@example.com>\r\nTo: <sip:user@example.com>\r\nCall-ID: 12345@10.10.10.1\r\nCSeq: 1 REGISTER\r\nContent-Length: 0\r\n\r\n"
    pkts = session(5060, client_payload=req, server_payload=resp)
    wrpcap(path, pkts)
    print(f"[+] sip: {path}")

# ---- SNMP (161/udp) ----
def create_snmp_pcap(path):
    """SNMPv2c: GetRequest via UDP."""
    # SNMPv2c GetRequest for sysDescr.0 (minimal ASN.1)
    snmp = b"0" + b"\x1c"  # Sequence (length=28)
    snmp += b"\x02\x01\x01"  # version=1 (v2c)
    snmp += b"\x04\x06public"  # community="public"
    snmp += b"\xa0\x13"  # GetRequest
    snmp += b"\x02\x02\x01\x2a"  # request-id=298
    snmp += b"\x02\x01\x00"  # error=0
    snmp += b"\x02\x01\x00"  # error-index=0
    snmp += b"\x30\x0b"  # varbind list
    snmp += b"\x30\x09"  # varbind
    snmp += b"\x06\x05\x2b\x06\x01\x02\x01\x01\x01\x00"  # OID=sysDescr.0 1.3.6.1.2.1.1.1.0
    snmp += b"\x05\x00"  # value=NULL
    pkts = udp_session(161, client_payload=snmp)
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

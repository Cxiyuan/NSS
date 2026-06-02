#!/usr/bin/env python3
"""Generate PCAPs for additional protocols.

Simpler approach: client sends first, server responds.
Verified working: postgresql, redis.
"""
import argparse
import struct
from scapy.all import IP, TCP, UDP, Raw, wrpcap, conf
conf.verb = 0

def session(port, client=b"", server=b""):
    """TCP handshake → client data → server data → FIN."""
    pkts = []
    s, d = "10.10.10.1", "10.10.10.2"
    sp, dp = 50000, port
    seq, ack = 1000, 2000
    pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='S', seq=seq))
    pkts.append(IP(src=d, dst=s)/TCP(sport=dp, dport=sp, flags='SA', seq=ack, ack=seq+1))
    pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='A', seq=seq+1, ack=ack+1))
    cs, ss = seq+1, ack+1
    if client:
        pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='PA', seq=cs, ack=ss)/Raw(load=client))
        cs += len(client)
        pkts.append(IP(src=d, dst=s)/TCP(sport=dp, dport=sp, flags='A', seq=ss, ack=cs))
    if server:
        pkts.append(IP(src=d, dst=s)/TCP(sport=dp, dport=sp, flags='PA', seq=ss, ack=cs)/Raw(load=server))
        ss += len(server)
        pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='A', seq=cs, ack=ss))
    pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='FA', seq=cs, ack=ss))
    pkts.append(IP(src=d, dst=s)/TCP(sport=dp, dport=sp, flags='FA', seq=ss, ack=cs+1))
    pkts.append(IP(src=s, dst=d)/TCP(sport=sp, dport=dp, flags='A', seq=cs+1, ack=ss+1))
    return pkts

def udp_session(port, client=b"", server=b""):
    pkts = []
    s, d = "10.10.10.1", "10.10.10.2"
    pkts.append(IP(src=s, dst=d)/UDP(sport=50000, dport=port)/Raw(load=client))
    if server:
        pkts.append(IP(src=d, dst=s)/UDP(sport=port, dport=50000)/Raw(load=server))
    return pkts

def create_ftp_pcap(path):
    """FTP: USER + PASS commands on port 21."""
    c = b"USER testuser\r\nPASS testpass\r\n"
    s = b"220 FTP ready\r\n331 OK\r\n230 OK\r\n"
    wrpcap(path, session(21, c, s))
    print(f"[+] ftp: {path}")

def create_rdp_pcap(path):
    """RDP: Connection Request on port 3389."""
    tpkt = struct.pack(">BBH", 3, 0, 11)  # TPKT
    cotp = struct.pack("BBHBB", 0x01, 0x00, 0x08, 0x00, 0x00)
    req = struct.pack("BBH", 0x01, 0x00, 0x08) + struct.pack(">I", 1)
    wrpcap(path, session(3389, tpkt+cotp+req))
    print(f"[+] rdp: {path}")

def create_smb_pcap(path):
    """SMB: Negotiate Protocol Request on port 445."""
    nb = struct.pack(">I", 64) + b"\xfe\x53\x4d\x42"
    nb += struct.pack("<II", 64, 0)  # StructureSize, CreditCharge/Status
    nb += struct.pack("BB", 0x00, 0x00)  # Command, Credits
    nb += struct.pack("<I", 0x00)  # Flags
    nb += b"\x00" * 44  # remaining header
    wrpcap(path, session(445, nb))
    print(f"[+] smb: {path}")

def create_mysql_pcap(path):
    """MySQL: server greeting first."""
    g = struct.pack("B", 10) + b"8.0.32\x00" + struct.pack(">I", 1)
    g += b"abcdefgh\x00\xff\xff\xff" + struct.pack("B", 33)
    g += struct.pack("<H", 0) + struct.pack("BB", 0x0f, 21)
    g += b"\x00"*10 + b"ijklmnopqrstuv\x00" + b"mysql_native_password\x00"
    pkts = session(3306, server=g)
    wrpcap(path, pkts)
    print(f"[+] mysql: {path}")

def create_postgresql_pcap(path):
    """PostgreSQL: StartupMessage → Auth OK."""
    startup = struct.pack(">II", 8+4+5+4+4+1, 196608) + b"user\x00tu\x00database\x00tdb\x00\x00"
    srv = struct.pack(">cI", b"R", 8) + struct.pack(">I", 0)
    wrpcap(path, session(5432, startup, srv))
    print(f"[+] postgresql: {path}")

def create_redis_pcap(path):
    """Redis: PING/PONG."""
    wrpcap(path, session(6379, b"PING\r\n", b"+PONG\r\n"))
    print(f"[+] redis: {path}")

def create_sip_pcap(path):
    """SIP: INVITE request."""
    r = b"INVITE sip:1000@e.com SIP/2.0\r\nVia: SIP/2.0/TCP 10.10.10.1:5060;branch=z9hG4bK\r\nFrom: <sip:u@e.com>;tag=a\r\nTo: <sip:1@e.com>\r\nCall-ID: a@10.10.10.1\r\nCSeq: 1 INVITE\r\nContact: <sip:u@10.10.10.1>\r\nContent-Length: 0\r\n\r\n"
    wrpcap(path, session(5060, r))
    print(f"[+] sip: {path}")

def create_snmp_pcap(path):
    """SNMPv2c: GetRequest."""
    ver = b"\x02\x01\x01"; com = b"\x04\x06public"
    rid = b"\x02\x02\x2a\x2a"; err = b"\x02\x01\x00"
    oid = b"\x06\x08\x2b\x06\x01\x02\x01\x01\x01\x00"
    val = b"\x05\x00"; vb = b"\x30\x0c" + oid + val
    vbl = b"\x30\x0e" + vb; pdu = b"\xa0\x12" + rid + err + err + vbl
    req = b"\x30" + bytes([len(ver+com+pdu)]) + ver + com + pdu
    wrpcap(path, udp_session(161, req))
    print(f"[+] snmp: {path}")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("-o", default="pcap")
    args = p.parse_args()
    o = args.o.rstrip("/")
    for name, fn in [("ftp", create_ftp_pcap), ("rdp", create_rdp_pcap),
                     ("smb", create_smb_pcap), ("mysql", create_mysql_pcap),
                     ("postgresql", create_postgresql_pcap),
                     ("redis", create_redis_pcap), ("sip", create_sip_pcap),
                     ("snmp", create_snmp_pcap)]:
        fn(f"{o}/{name}.pcap")
    print(f"[OK] 8 pcaps in {o}/")

#!/usr/bin/env python3
"""Generate PCAPs for additional protocols."""
import argparse, struct
from scapy.all import IP, TCP, UDP, Raw, wrpcap, conf
conf.verb = 0

def tcp_session_exchange(port, exchanges):
    """
    Build TCP session with ordered exchanges: [(src, data), (dst, data), ...]
    src="c" = client, src="s" = server
    """
    pkts = []
    s_ip, d_ip = "10.10.10.1", "10.10.10.2"
    sp, dp = 50000, port
    seq, ack = 1000, 2000
    pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='S', seq=seq))
    pkts.append(IP(src=d_ip, dst=s_ip)/TCP(sport=dp, dport=sp, flags='SA', seq=ack, ack=seq+1))
    pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='A', seq=seq+1, ack=ack+1))
    cs, ss = seq+1, ack+1
    for src, data in exchanges:
        if src == "c":
            pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='PA', seq=cs, ack=ss)/Raw(load=data))
            cs += len(data)
            pkts.append(IP(src=d_ip, dst=s_ip)/TCP(sport=dp, dport=sp, flags='A', seq=ss, ack=cs))
        else:
            pkts.append(IP(src=d_ip, dst=s_ip)/TCP(sport=dp, dport=sp, flags='PA', seq=ss, ack=cs)/Raw(load=data))
            ss += len(data)
            pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='A', seq=cs, ack=ss))
    pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='FA', seq=cs, ack=ss))
    pkts.append(IP(src=d_ip, dst=s_ip)/TCP(sport=dp, dport=sp, flags='FA', seq=ss, ack=cs+1))
    pkts.append(IP(src=s_ip, dst=d_ip)/TCP(sport=sp, dport=dp, flags='A', seq=cs+1, ack=ss+1))
    return pkts

def udp_exchange(port, client=b"", server=b""):
    pkts = []
    pkts.append(IP(src="10.10.10.1", dst="10.10.10.2")/UDP(sport=50000, dport=port)/Raw(load=client))
    if server:
        pkts.append(IP(src="10.10.10.2", dst="10.10.10.1")/UDP(sport=port, dport=50000)/Raw(load=server))
    return pkts

# ---- FTP (21/tcp): server greeting → USER → server OK → PASS → server OK ----
def create_ftp_pcap(path):
    e = [("s", b"220 FTP server ready.\r\n"),
         ("c", b"USER testuser\r\n"),
         ("s", b"331 Password required.\r\n"),
         ("c", b"PASS testpass\r\n"),
         ("s", b"230 Login successful.\r\n")]
    wrpcap(path, tcp_session_exchange(21, e))
    print(f"[+] ftp: {path}")

# ---- RDP (3389/tcp): TPKT-COTP + RDP Negotiation ----
def create_rdp_pcap(path):
    tpkt = struct.pack(">BBH", 3, 0, 11)
    cotp = struct.pack(">BBHBB", 0x01, 0x00, 0x08, 0x00, 0x00)
    req = struct.pack(">BBH", 0x01, 0x00, 0x08) + struct.pack(">I", 0x00000001)
    e = [("c", tpkt+cotp+req)]
    wrpcap(path, tcp_session_exchange(3389, e))
    print(f"[+] rdp: {path}")

# ---- SMB (445/tcp): SMBv2 Negotiate ----
def create_smb_pcap(path):
    nb = struct.pack(">I", 64)
    nb += b"\xfe\x53\x4d\x42"
    nb += struct.pack("<II", 64, 0)
    nb += b"\x00" * 52
    e = [("c", nb)]
    wrpcap(path, tcp_session_exchange(445, e))
    print(f"[+] smb: {path}")

# ---- MySQL (3306/tcp): server greeting → client login ----
def create_mysql_pcap(path):
    g = struct.pack("B", 10) + b"8.0.32\x00"
    g += struct.pack(">I", 123456)  # connection id
    g += b"abcdefgh\x00"  # auth-data-1
    g += struct.pack("<H", 0xffff)  # capability
    g += struct.pack("B", 33)  # charset
    g += struct.pack("<H", 0x0200)  # server status
    g += struct.pack("B", 0xff)  # capability upper
    g += struct.pack("B", 21)  # auth-data-len
    g += b"\x00" * 10  # reserved
    g += b"ijklmnopqrstuvwxyz\x00"  # auth-data-2
    g += b"mysql_native_password\x00"
    hdr = struct.pack("<I", len(g))[:3] + bytes([0])
    greeting_msg = hdr + g
    # Client login
    c = struct.pack("<I", 0x00000801)
    c += struct.pack("<I", 16777215)
    c += struct.pack("B", 33) + b"\x00" * 23
    c += b"testuser\x00"
    c += b"\x14" + b"0123456789abcdef"
    c += b"mysql_native_password\x00"
    chdr = struct.pack("<I", len(c))[:3] + bytes([1])
    e = [("s", greeting_msg), ("c", chdr + c)]
    wrpcap(path, tcp_session_exchange(3306, e))
    print(f"[+] mysql: {path}")

# ---- PostgreSQL (5432/tcp) ----
def create_postgresql_pcap(path):
    startup = struct.pack(">II", 4*4+5+1, 196608)
    startup += b"user\x00tu\x00database\x00tdb\x00\x00"
    srv = struct.pack(">cI", b"R", 8) + struct.pack(">I", 0)
    e = [("c", startup), ("s", srv)]
    wrpcap(path, tcp_session_exchange(5432, e))
    print(f"[+] postgresql: {path}")

# ---- Redis (6379/tcp) ----
def create_redis_pcap(path):
    e = [("c", b"PING\r\n"), ("s", b"+PONG\r\n")]
    wrpcap(path, tcp_session_exchange(6379, e))
    print(f"[+] redis: {path}")

# ---- SIP (5060/tcp) ----
def create_sip_pcap(path):
    r = b"INVITE sip:1000@e.com SIP/2.0\r\nVia: SIP/2.0/TCP 10.10.10.1:5060;branch=z9hG4bK\r\nFrom: <sip:u@e.com>;tag=a\r\nTo: <sip:1@e.com>\r\nCall-ID: a@10.10.10.1\r\nCSeq: 1 INVITE\r\nContact: <sip:u@10.10.10.1>\r\nMax-Forwards: 70\r\nContent-Length: 0\r\n\r\n"
    w = b"SIP/2.0 100 Trying\r\nVia: SIP/2.0/TCP 10.10.10.1:5060;branch=z9hG4bK\r\nFrom: <sip:u@e.com>;tag=a\r\nTo: <sip:1@e.com>\r\nCall-ID: a@10.10.10.1\r\nCSeq: 1 INVITE\r\nContent-Length: 0\r\n\r\n"
    e = [("c", r), ("s", w)]
    wrpcap(path, tcp_session_exchange(5060, e))
    print(f"[+] sip: {path}")

# ---- SNMP (161/udp): GetRequest ----
def create_snmp_pcap(path):
    ver = b"\x02\x01\x01"; com = b"\x04\x06public"
    rid = b"\x02\x02\x2a\x2a"; err = b"\x02\x01\x00"
    oid = b"\x06\x08\x2b\x06\x01\x02\x01\x01\x01\x00"
    vb = b"\x30\x0c" + oid + b"\x05\x00"
    pdu = b"\xa0\x12" + rid + err + err + b"\x30\x0e" + vb
    req = b"\x30" + bytes([len(ver+com+pdu)]) + ver + com + pdu
    wrpcap(path, udp_exchange(161, req))
    print(f"[+] snmp: {path}")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("-o", default="pcap")
    args = p.parse_args()
    o = args.o.rstrip("/")
    for fn in [create_ftp_pcap, create_rdp_pcap, create_smb_pcap,
               create_mysql_pcap, create_postgresql_pcap,
               create_redis_pcap, create_sip_pcap, create_snmp_pcap]:
        fn(f"{o}/{fn.__name__[7:-5]}.pcap")
    print(f"[OK] 8 pcaps in {o}/")

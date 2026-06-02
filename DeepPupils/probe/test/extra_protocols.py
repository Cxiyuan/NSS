#!/usr/bin/env python3
"""Generate PCAPs for extended protocols (ftp, rdp, smb, mysql, postgresql, redis, sip, snmp).

Each function generates a PCAP with sufficient protocol exchange for Zeek to
detect and produce a log entry. SMB and RDP use real payloads from Zeek test traces.
"""
import argparse, struct
from scapy.all import IP, TCP, UDP, Raw, wrpcap, conf
conf.verb = 0

# ============================================================
# Helper: TCP session with ordered exchanges
# ============================================================
def tcp_session_exchange(port, exchanges):
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
    pkts = [IP(src="10.10.10.1", dst="10.10.10.2")/UDP(sport=50000, dport=port)/Raw(load=client)]
    if server:
        pkts.append(IP(src="10.10.10.2", dst="10.10.10.1")/UDP(sport=port, dport=50000)/Raw(load=server))
    return pkts

# ============================================================
# Real SMB2 + RDP payloads (from Zeek test traces)
# ============================================================
# SMB2: negotiate + session setup + tree connect in one exchange
SMB_CLIENT = bytes.fromhex(
    "000001b8fe534d4240000100000000000500000100000000f80000009803000000000000fffe0000"
    "b9b6e317fb8c8dbc0000000000000000000000000000000000000000390000ff0200000000000000"
    "0000000000000000000000800011008000000000000000010000000000000078001800900000006800"
    "00007400650073007400660069006c0065002e00740078007400180000001000040000000000000000"
    "004d784163000000000000000010000400000018003400000052714c7300000000aa380037c6de80a3"
    "0ba559d4e8af6dc500000000040000000000000000000000ddcaa13c97574b0189d461e272e0e4d1"
    "0000000000000000fe534d4240000100000000001100000104000000680000009903000000000000ff"
    "fe0000b9b6e317fb8c8dbc00000000000000000000000000000000000000002100010d010000006000"
    "000000000000ffffffffffffffffffffffffffffffff0100000000000000fe534d4240000100000000"
    "000600000104000000000000009a03000000000000fffe0000b9b6e317fb8c8dbc0000000000000000"
    "0000000000000000000000001800000000000000ffffffffffffffffffffffffffffffff"
)
SMB_SERVER = bytes.fromhex(
    "000001d0fe534d4240000100000000000500000001000000080100009803000000000000fffe0000"
    "b9b6e317fb8c8dbc00000000000000000000000000000000000000005900ff0001000000f00e7cb6"
    "7554da01eaef46d87854da011b187cb67554da011b187cb67554da0100100000000000000c00000000"
    "0000002000000000000000b3ab5b6400000000bd96b75100000000980000006c000000200000001000"
    "040000001800080000004d7841630000000000000000ff011f00000000001000040000001800340000"
    "0052714c7300000000aa380037c6de80a30ba559d4e8af6dc500000000000000000000000000000000"
    "000000000000000000000000000000000100000000000000fe534d4240000100000000001100000005"
    "000000480000009903000000000000fffe0000b9b6e317fb8c8dbc0000000000000000000000000000"
    "0000000000000200000000000000fe534d4240000100000000000600030005000000000000009a0300"
    "0000000000fffe0000b9b6e317fb8c8dbc00000000000000000000000000000000000000003c000000"
    "00000000000000000000000000000000000000000000000000000000000000000000000000000000"
    "0000000000000000000000000000000000"
)
# RDP: COTP CR(47) + COTP CC(19) + GCC Client(446) + GCC Server(1398)
RDP_CR  = bytes.fromhex("0300002f2ae00000000000436f6f6b69653a206d737473686173683d4a4f484e2d504320200d0a0100080000000000")
RDP_CC  = bytes.fromhex("030000130ed000001234000200080000000000")
RDP_GCC_CLIENT = bytes.fromhex(
    "030001be02f0807f658201b20401010401010101ff30190201220201020201000201010201000201"
    "010202ffff020102301902010102010102010102010102010002010102020420020102301c0202ff"
    "ff0202fc170202ffff0201010201000201010202ffff02010204820151000500147c000181480008"
    "00100001c00044756361813a01c0ea00040008008007380401ca03aa09040000802500004a004f00"
    "48004e002d00500043002d004c004100500054004f0050000000000004000000000000000c0000"
    "00000000000000000000000000000000000000000000000000000000000000000000000000000000"
    "000000000000000000000000000000000001ca01000000000010000f00ad07330063003500370031"
    "006500640030002d0033003400310035002d0034003700340062002d0061006500390034002d0037"
    "00340065003100350031006200000007000000000000000000000000000000000000000000000004"
    "c00c00150000000000000002c00c001b0000000000000003c0380004000000726470647200000000"
    "008080726470736e640000000000c0636c6970726472000000a0c0647264796e766300000080c0"
)
RDP_GCC_SERVER = bytes.fromhex(
    "0300057d02f0807f668205710a0100020100301a0201220201030201000201010201000201010203"
    "00fff80201020482054b000500147c00012a14760a01010001c0004d63446e8534010c0c00040008"
    "0000000000030c1000eb030400ec03ed03ee03ef03020c1805020000000200000020000000e40400"
    "009fda0605a0e36f690bff0ca0b121db62dae41b971235375c712b642d8ae3cfa7020000800200"
    "00005f0100003082015b30820109a003020102020859eb28cb02b1a0d4300906052b0e03021d0500"
    "302c312a301106035504031e0a00530045005200560052301506035504071e0e005400550052004e"
    "0042004b004c301e170d3135303231313134313530365a170d3135303531323030303030305a302c"
    "312a301106035504031e0a00530045005200560052301506035504071e0e005400550052004e0042"
    "004b004c305c300d06092a864886f70d0101010500034b003048024100d31474f69f983d557757f6"
    "680d765c1965f19f8b7d31a605a2aa3b47e14ba9d01a3fce1780402e77838f7bb5e47be12c18ee"
    "fcc3e277ffd9d6936ad6ce9809fd0203010001a3133011300f0603551d13040830060101ff020100"
    "300906052b0e03021d05000341008a9264745d17d5003e74c9039a10e0c1f3ae56d8ef0f5523cda8"
    "8209f56bdad26a18caa9b2a1d12a7aee6b57858a3a07aafb116c5fb9feff7592abaa02feac9c65"
    "030000308203613082030fa00302010202050100000001300906052b0e03021d0500302c312a3011"
    "06035504031e0a00530045005200560052301506035504071e0e005400550052004e0042004b004c"
    "301e170d3133303430353135313535355a170d3136313233313233353935395a30818e31818b3021"
    "06035504031e1a006e00630061006c007200700063003a0053004500520056005230210603550407"
    "1e1a006e00630061006c007200700063003a00530045005200560052304306035504051e3c003100"
    "420063004b006500660059005300460039003700450076006b006100690043007100610068005000"
    "5900380075005000640030003d000d000a305c300d06092a864886f70d0101040500034b00304802"
    "4100f22d4e9a36ed8f684449ede380f86db3fc0360ad644dc4e3a5d200e9247b92efa8657610e7"
    "fbe2256f46837c33d8620ccbb366963b13c6772b60428cb221acc70203010001a38201b7308201b3"
    "301406092b06010401823712040101ff040401000500303c06092b06010401823712020101ff042c"
    "4d006900630072006f0073006f0066007400200043006f00720070006f0072006100740069006f00"
    "6e0000003081cd06092b06010401823712050101ff0481bc00300000010000000200000009040000"
    "1c004a0066004a00b0000100330064003200360037003900350034002d0065006500630037002d00"
    "31003100640031002d0062003900340065002d003000300064003000340066006100330030003800"
    "300064000000330064003200360037003900350034002d0064006500610037002d00310032006400"
    "31002d0062003900340065002d003000300063003000340066006100330030003800300064000000"
    "000000100080d40000000000306806092b06010401823712060101ff04580030000000000c003c00"
    "530045005200560052000000360039003700310033002d003000310032002d003400370030003100"
    "3700360033002d003400340037003500310000005400550052004e0042004b004c00000000003023"
    "0603551d230101ff04193017a10ea40c53004500520056005200000082050100000001300906052b"
    "0e03021d0500034100aad15319b38adaf8857735cc8a23af10d4c0c2407ca60092163e4e65e38331"
    "c22395ecbe98581f61d9924279fa483f72aa4064c01d34016491ee237ce26bcce300000000000000"
    "0000"
)

# ============================================================
# Protocol PCAP generators
# ============================================================

def create_ftp_pcap(path):
    """FTP: login + RETR (RETR triggers ftp.log via logged_commands)."""
    e = [("s", b"220 FTP server ready.\r\n"),
         ("c", b"USER testuser\r\n"),
         ("s", b"331 Password required.\r\n"),
         ("c", b"PASS testpass\r\n"),
         ("s", b"230 Login successful.\r\n"),
         ("c", b"RETR testfile.txt\r\n"),
         ("s", b"150 Opening data connection\r\n")]
    wrpcap(path, tcp_session_exchange(21, e))
    print(f"[+] ftp: {path}")

def create_rdp_pcap(path):
    """RDP: COTP CR + COTP CC + GCC Client + GCC Server (real trace)."""
    e = [("c", RDP_CR), ("s", RDP_CC),
         ("c", RDP_GCC_CLIENT), ("s", RDP_GCC_SERVER)]
    wrpcap(path, tcp_session_exchange(3389, e))
    print(f"[+] rdp: {path}")

def create_smb_pcap(path):
    """SMB2: negotiate + session setup + tree connect (real trace)."""
    e = [("c", SMB_CLIENT), ("s", SMB_SERVER)]
    wrpcap(path, tcp_session_exchange(445, e))
    print(f"[+] smb: {path}")

def create_mysql_pcap(path):
    """MySQL: greeting + handshake response + COM_QUERY (triggers mysql.log)."""
    g = struct.pack("B", 10) + b"8.0.32\x00"
    g += struct.pack(">I", 123456)
    g += b"abcdefgh\x00"
    g += struct.pack("<H", 0xffff)
    g += struct.pack("B", 33)
    g += struct.pack("<H", 0x0200)
    g += struct.pack("B", 0xff)
    g += struct.pack("B", 21)
    g += b"\x00" * 10
    g += b"ijklmnopqrstuvwxyz\x00"
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
    login_pkt = chdr + c
    # COM_QUERY: seq_id=2, cmd=0x03, query="SELECT 1"
    query = b"\x03" + b"SELECT 1"
    qhdr = struct.pack("<I", len(query))[:3] + bytes([2])
    query_pkt = qhdr + query
    # Server OK after query
    ok = struct.pack("<I", 7)[:3] + bytes([3])  # seq_id=3
    ok += struct.pack("B", 0x00) + struct.pack("<I", 0) + struct.pack("<I", 1)
    e = [("s", greeting_msg), ("c", login_pkt), ("c", query_pkt), ("s", ok)]
    wrpcap(path, tcp_session_exchange(3306, e))
    print(f"[+] mysql: {path}")

def create_postgresql_pcap(path):
    """PostgreSQL: Startup + AuthenticationOk (sufficient for log)."""
    startup = struct.pack(">II", 4*4+5+1, 196608)
    startup += b"user\x00tu\x00database\x00tdb\x00\x00"
    srv = struct.pack(">cI", b"R", 8) + struct.pack(">I", 0)
    e = [("c", startup), ("s", srv)]
    wrpcap(path, tcp_session_exchange(5432, e))
    print(f"[+] postgresql: {path}")

def create_redis_pcap(path):
    """Redis: PING/PONG (sufficient for log)."""
    e = [("c", b"PING\r\n"), ("s", b"+PONG\r\n")]
    wrpcap(path, tcp_session_exchange(6379, e))
    print(f"[+] redis: {path}")

def create_sip_pcap(path):
    """SIP: INVITE + 100 Trying via UDP (Zeek SIP analyzer is UDP-only)."""
    req = (b"INVITE sip:1000@e.com SIP/2.0\r\n"
           b"Via: SIP/2.0/UDP 10.10.10.1:5060;branch=z9hG4bK\r\n"
           b"From: <sip:u@e.com>;tag=a\r\n"
           b"To: <sip:1@e.com>\r\n"
           b"Call-ID: a@10.10.10.1\r\n"
           b"CSeq: 1 INVITE\r\n"
           b"Contact: <sip:u@10.10.10.1>\r\n"
           b"Max-Forwards: 70\r\n"
           b"Content-Length: 0\r\n\r\n")
    resp = (b"SIP/2.0 100 Trying\r\n"
            b"Via: SIP/2.0/UDP 10.10.10.1:5060;branch=z9hG4bK\r\n"
            b"From: <sip:u@e.com>;tag=a\r\n"
            b"To: <sip:1@e.com>\r\n"
            b"Call-ID: a@10.10.10.1\r\n"
            b"CSeq: 1 INVITE\r\n"
            b"Content-Length: 0\r\n\r\n")
    wrpcap(path, udp_exchange(5060, client=req, server=resp))
    print(f"[+] sip: {path}")

def create_snmp_pcap(path):
    """SNMP: GetRequest + GetResponse (confirms on responder header)."""
    # GetRequest: version=1, community="public", OID=sysDescr.0
    ver = b"\x02\x01\x01"; com = b"\x04\x06public"
    rid = b"\x02\x02\x2a\x2a"; err = b"\x02\x01\x00"
    oid = b"\x06\x08\x2b\x06\x01\x02\x01\x01\x01\x00"
    vb = b"\x30\x0c" + oid + b"\x05\x00"
    pdu = b"\xa0\x12" + rid + err + err + b"\x30\x0e" + vb
    req = b"\x30" + bytes([len(ver+com+pdu)]) + ver + com + pdu
    # GetResponse: same as request but PDU tag 0xa2 instead of 0xa0
    resp_pdu = b"\xa2\x12" + rid + err + err + b"\x30\x0e" + vb
    resp = b"\x30" + bytes([len(ver+com+resp_pdu)]) + ver + com + resp_pdu
    wrpcap(path, udp_exchange(161, client=req, server=resp))
    print(f"[+] snmp: {path}")

# ============================================================
# Main
# ============================================================
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

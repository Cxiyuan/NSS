#!/usr/bin/env python3
"""Generate TCP/UDP/ICMP connection PCAPs for conn.log verification.

Creates network connections that Zeek detects and logs as conn.log entries:
- TCP SYN/SYN-ACK/ACK → data → FIN (complete connection)
- TCP SYN → RST (rejected connection)
- UDP datagram exchange (simulating DNS-style)
- ICMP echo request/reply
"""
import argparse
import random
import struct
import time
from datetime import datetime

from scapy.all import IP, TCP, UDP, ICMP, Raw, send, wrpcap, conf

conf.verb = 0


def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_port():
    return random.randint(49152, 65535)


def build_tcp_session(src_ip, dst_ip, sport, dport, payload=b"GET / HTTP/1.0\r\n\r\n",
                      fin=True, rst=False):
    """Build a complete TCP session packet list."""
    packets = []
    seq = random.randint(1000, 99999999)

    # SYN
    syn_seq = seq
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='S', seq=syn_seq))
    # SYN-ACK
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=syn_seq + 1))
    # ACK
    client_seq = syn_seq + 1
    server_seq = syn_ack_seq + 1
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq, ack=server_seq))

    if payload:
        # Data from client
        packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=server_seq) / Raw(load=payload))
        client_seq += len(payload)
        # ACK from server
        packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='A', seq=server_seq, ack=client_seq))

    if rst:
        # RST from server
        packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='R', seq=server_seq, ack=client_seq))
    elif fin:
        # FIN from client
        packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq))
        # FIN-ACK from server
        packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_seq, ack=client_seq + 1))
        # ACK from client
        packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq + 1, ack=server_seq + 1))

    return packets


def build_udp_exchange(src_ip, dst_ip, sport, dport, req_payload=b"query", resp_payload=b"response"):
    """Build a UDP request/response packet pair."""
    packets = []
    packets.append(IP(src=src_ip, dst=dst_ip) / UDP(sport=sport, dport=dport) / Raw(load=req_payload))
    packets.append(IP(src=dst_ip, dst=src_ip) / UDP(sport=dport, dport=sport) / Raw(load=resp_payload))
    return packets


def build_icmp_ping(src_ip, dst_ip, seq_num=1):
    """Build an ICMP echo request → reply pair."""
    packets = []
    echo_id = random.randint(1000, 9999)
    packets.append(IP(src=src_ip, dst=dst_ip) / ICMP(type=8, code=0, id=echo_id, seq=seq_num) / Raw(load=b"ping probe"))
    packets.append(IP(src=dst_ip, dst=src_ip) / ICMP(type=0, code=0, id=echo_id, seq=seq_num) / Raw(load=b"ping probe"))
    return packets


def generate_conn_pcap(output_file, session_count=3):
    """Generate PCAP with various TCP/UDP/ICMP connections for conn.log testing."""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()

    idx = 0

    # TCP complete sessions (HTTP-like, port 80)
    for i in range(session_count):
        packets.extend(build_tcp_session(
            client_ip, server_ip, random_port(), 80,
            payload=f"GET /page/{i} HTTP/1.0\r\nHost: example.com\r\n\r\n".encode()
        ))
        idx += 1

    # TCP rejected session (SYN → RST)
    packets.extend(build_tcp_session(
        client_ip, server_ip, random_port(), 81,
        payload=b"", rst=True
    ))
    idx += 1

    # TCP session with larger data (port 443-like)
    packets.extend(build_tcp_session(
        client_ip, server_ip, random_port(), 443,
        payload=b"\x16\x03\x01\x00\x10" + b"x" * 100  # TLS-like record
    ))
    idx += 1

    # UDP exchanges (ports 53, 123, 514)
    udp_tests = [
        (53, b"\x00\x01\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + b"x" * 16),
        (123, struct.pack(">I", 0x23) + b"x" * 40),
        (514, b"syslog message here"),
    ]
    for dport, payload in udp_tests:
        packets.extend(build_udp_exchange(
            client_ip, server_ip, random_port(), dport,
            req_payload=payload, resp_payload=b"ok"
        ))
        idx += 1

    # ICMP ping
    for i in range(2):
        packets.extend(build_icmp_ping(client_ip, "8.8.8.8", seq_num=i + 1))
        idx += 1

    wrpcap(output_file, packets)
    print(f"[+] conn: {output_file} ({len(packets)} packets, {idx} sessions)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate conn.log test PCAP")
    parser.add_argument("-o", "--output", type=str, default="conn.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_conn_pcap(args.output, args.count)

#!/usr/bin/env python3
"""Generate DNS query/response PCAPs for dns.log verification.

Crafts valid DNS wire-format packets that Zeek detects and logs:
- A record query → successful response with IPv4
- AAAA record query → successful response with IPv6
- MX record query → successful response with mail exchange
- CNAME record query → successful response with alias
- NXDOMAIN query → response with error code
"""
import argparse
import random
import struct

from scapy.all import IP, UDP, Raw, wrpcap, conf

conf.verb = 0


def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_port():
    return random.randint(49152, 65535)


def dns_name_to_wire(name):
    """Convert 'example.com' to DNS wire format \\x03example\\x03com\\x00"""
    parts = name.rstrip('.').split('.')
    result = b''
    for part in parts:
        result += bytes([len(part)]) + part.encode()
    return result + b'\x00'


def build_dns_header(txid, flags, qdcount=1, ancount=0, nscount=0, arcount=0):
    """Build a 12-byte DNS header."""
    return struct.pack(">HHHHHH", txid, flags, qdcount, ancount, nscount, arcount)


def build_dns_question(qname, qtype=1, qclass=1):
    """Build a DNS question section entry."""
    return dns_name_to_wire(qname) + struct.pack(">HH", qtype, qclass)


def build_dns_rr_a(name, ttl, ip, rtype=1, rclass=1):
    """Build a DNS resource record for A/AAAA replies."""
    name_wire = dns_name_to_wire(name)
    ip_bytes = bytes([int(x) for x in ip.split('.')])
    rdlength = len(ip_bytes)
    return name_wire + struct.pack(">HHIH", rtype, rclass, ttl, rdlength) + ip_bytes


def build_dns_rr_aaaa(name, ttl, ipv6, rtype=28, rclass=1):
    """Build a DNS AAAA resource record."""
    name_wire = dns_name_to_wire(name)
    ip_bytes = bytes(int(x, 16) for x in ipv6.split(':'))
    rdlength = len(ip_bytes)
    return name_wire + struct.pack(">HHIH", rtype, rclass, ttl, rdlength) + ip_bytes


def build_dns_rr_mx(name, ttl, exchange, preference=10, rtype=15, rclass=1):
    """Build a DNS MX resource record."""
    name_wire = dns_name_to_wire(name)
    exchange_wire = dns_name_to_wire(exchange)
    rdlength = 2 + len(exchange_wire)
    return name_wire + struct.pack(">HHIH", rtype, rclass, ttl, rdlength) + struct.pack(">H", preference) + exchange_wire


def build_dns_rr_cname(name, ttl, cname, rtype=5, rclass=1):
    """Build a DNS CNAME resource record."""
    name_wire = dns_name_to_wire(name)
    cname_wire = dns_name_to_wire(cname)
    rdlength = len(cname_wire)
    return name_wire + struct.pack(">HHIH", rtype, rclass, ttl, rdlength) + cname_wire


def build_dns_packet(txid, qname, qtype, flags_qr=0, rcode=0, answers=None):
    """Build a complete DNS UDP packet (query or response)."""
    if flags_qr:
        flags = 0x8000 | (rcode & 0xf)  # QR=1 + rcode
        ancnt = len(answers) if answers else 0
    else:
        flags = 0x0100  # standard query, RD=1
        ancnt = 0

    header = build_dns_header(txid, flags, qdcount=1, ancount=ancnt)
    question = build_dns_question(qname, qtype)
    body = header + question

    if answers:
        for ans in answers:
            body += ans

    return body


def generate_dns_pcap(output_file, session_count=3):
    """Generate PCAP with DNS query/response exchanges."""
    packets = []
    client_ip = random_ip()
    dns_server = "8.8.8.8"

    scenarios = [
        ("example.com", 1, "93.184.216.34", None, 0),             # A record
        ("google.com", 28, "2001:4860:4860::8888", None, 0),       # AAAA record
        ("gmail.com", 15, "gmail-smtp-in.l.google.com.", None, 0),  # MX record
        ("www.github.com", 5, "github.com.", None, 0),              # CNAME
        ("nonexistent.invalid", 1, None, None, 3),                  # NXDOMAIN
    ]

    for i, (qname, qtype, answer, _, rcode) in enumerate(scenarios):
        txid = random.randint(1, 65535)
        sport = random_port()

        # Build answer section (for non-error responses)
        answers = []
        if rcode == 0 and answer:
            if qtype == 1:  # A
                answers.append(build_dns_rr_a(qname, 300, answer))
            elif qtype == 28:  # AAAA
                answers.append(build_dns_rr_aaaa(qname, 300, answer))
            elif qtype == 15:  # MX
                answers.append(build_dns_rr_mx(qname, 300, answer))
            elif qtype == 5:  # CNAME
                answers.append(build_dns_rr_cname(qname, 300, answer))

        # Query packet
        query_payload = build_dns_packet(txid, qname, qtype, flags_qr=0)
        packets.append(
            IP(src=client_ip, dst=dns_server) /
            UDP(sport=sport, dport=53) /
            Raw(load=query_payload)
        )

        # Response packet
        resp_payload = build_dns_packet(txid, qname, qtype, flags_qr=1, rcode=rcode, answers=answers)
        packets.append(
            IP(src=dns_server, dst=client_ip) /
            UDP(sport=53, dport=sport) /
            Raw(load=resp_payload)
        )

    wrpcap(output_file, packets)
    print(f"[+] dns: {output_file} ({len(packets)} packets, {len(scenarios)} queries)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate DNS log test PCAP")
    parser.add_argument("-o", "--output", type=str, default="dns.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_dns_pcap(args.output, args.count)

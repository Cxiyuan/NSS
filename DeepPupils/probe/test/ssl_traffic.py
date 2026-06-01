#!/usr/bin/env python3
"""Generate TLS/SSL handshake PCAPs for ssl.log verification.

Creates TCP sessions with TLS handshakes that Zeek detects and logs
as ssl.log entries with version and cipher fields populated.

Each session: TCP handshake → ClientHello → ServerHello → ServerHelloDone → FIN
Skips Certificate to avoid random bytes confusing Zeek's parser.
"""
import argparse
import random
import struct

from scapy.all import IP, TCP, Raw, wrpcap, conf

conf.verb = 0


def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_port():
    return random.randint(49152, 65535)


def tls_record(content_type, version, payload):
    """Build a TLS record layer: content_type(1) + version(2) + length(2) + payload"""
    return struct.pack(">BHH", content_type, version, len(payload)) + payload


def tls_handshake_msg(msg_type, body):
    """Build a TLS Handshake message: type(1) + 3-byte-length + body"""
    return struct.pack(">B", msg_type) + struct.pack(">I", len(body))[1:4] + body


def build_client_hello(tls_version=0x0303, sni=None):
    """Build a TLS ClientHello handshake message."""
    random_bytes = bytes(range(32))
    session_id = bytes(range(32))

    # Cipher suites (TLS 1.3 + 1.2)
    ciphers = struct.pack(">HHHHHH",
        0x1301, 0x1302, 0x1303,      # TLS 1.3 ciphers
        0xc02b, 0xc02f, 0xcca8,      # TLS 1.2 ciphers
    )

    extensions = b""

    # SNI extension (0x0000)
    if sni:
        sni_b = sni.encode()
        sni_entry = struct.pack(">H", len(sni_b)) + sni_b
        sni_list = struct.pack(">H", len(sni_entry)) + sni_entry
        extensions += struct.pack(">HH", 0x0000, len(sni_list)) + sni_list

    # Supported versions (0x002b) — always present
    versions = [0x0303, tls_version] if tls_version >= 0x0304 else [0x0303]
    sv_body = struct.pack("B" + "H" * len(versions), len(versions) * 2, *versions)
    extensions += struct.pack(">HH", 0x002b, len(sv_body)) + sv_body

    # Supported groups (0x000a)
    groups = struct.pack(">HHH", 0x001d, 0x0017, 0x0018)
    ext_data = struct.pack(">H", len(groups)) + groups
    extensions += struct.pack(">HH", 0x000a, len(ext_data)) + ext_data

    # Signature algorithms (0x000d)
    algs = struct.pack(">HHH", 0x0804, 0x0805, 0x0403)
    ext_data = struct.pack(">H", len(algs)) + algs
    extensions += struct.pack(">HH", 0x000d, len(ext_data)) + ext_data

    # Extended master secret (0x0017)
    extensions += struct.pack(">HH", 0x0017, 0x0000)

    # Renegotiation info (0xff01)
    extensions += struct.pack(">HHB", 0xff01, 0x0001, 0x00)

    body = struct.pack(">H", 0x0303)  # legacy_version = TLS 1.2
    body += random_bytes
    body += struct.pack("B", len(session_id)) + session_id
    body += struct.pack(">H", len(ciphers)) + ciphers
    body += struct.pack(">H", 0x0100)  # compression: length(1) + null(1)
    body += struct.pack(">H", len(extensions)) + extensions

    return tls_record(0x16, 0x0301, tls_handshake_msg(0x01, body))


def build_server_hello(cipher_suite=0xc02b):
    """Build a TLS 1.2 ServerHello handshake message.

    No Certificate is sent — Zeek can determine version and cipher
    from ServerHello alone.
    """
    random_bytes = bytes(range(32, 64))
    session_id = bytes(range(32))

    body = struct.pack(">H", 0x0303)  # server_version = TLS 1.2
    body += random_bytes
    body += struct.pack("B", len(session_id)) + session_id
    body += struct.pack(">H", cipher_suite)
    body += struct.pack("B", 0x00)  # compression: null

    return tls_record(0x16, 0x0303, tls_handshake_msg(0x02, body))


def build_server_hello_done():
    """Build a TLS ServerHelloDone handshake message (empty body)."""
    return tls_record(0x16, 0x0303, tls_handshake_msg(0x0e, b""))


def build_tls_session(tls_version=0x0303, sni=None, cipher=0xc02b):
    """Build a full TCP+TLS session: handshake → ClientHello → ServerHello → FIN."""
    packets = []
    src_ip = random_ip()
    dst_ip = random_ip()
    sport = random_port()
    dport = 443
    seq = random.randint(1000, 99999999)
    ack_seq = random.randint(1000, 99999999)

    # --- TCP handshake ---
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq))
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=ack_seq, ack=seq + 1))
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=seq + 1, ack=ack_seq + 1))

    c_seq = seq + 1
    s_seq = ack_seq + 1

    # --- ClientHello ---
    ch = build_client_hello(tls_version=tls_version, sni=sni)
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=c_seq, ack=s_seq) / Raw(load=ch))
    c_seq += len(ch)

    # Server ACK of ClientHello
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='A', seq=s_seq, ack=c_seq))

    # --- ServerHello + ServerHelloDone ---
    sh = build_server_hello(cipher_suite=cipher)
    shd = build_server_hello_done()
    server_data = sh + shd

    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=s_seq, ack=c_seq) / Raw(load=server_data))
    s_seq += len(server_data)

    # Client ACK of server data
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=c_seq, ack=s_seq))

    # --- FIN ---
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=c_seq, ack=s_seq))
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=s_seq, ack=c_seq + 1))
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=c_seq + 1, ack=s_seq + 1))

    return packets


def generate_ssl_pcap(output_file):
    """Generate PCAP with TLS handshakes."""
    packets = []

    # Session 1: TLS 1.3 ClientHello + TLS 1.2 ServerHello, SNI=example.com
    packets.extend(build_tls_session(tls_version=0x0304, sni="example.com"))

    # Session 2: TLS 1.2, SNI=google.com
    packets.extend(build_tls_session(tls_version=0x0303, sni="google.com"))

    # Session 3: TLS 1.2, without SNI
    packets.extend(build_tls_session(tls_version=0x0303, sni=None))

    # Session 4: TLS 1.3 ClientHello, without SNI
    packets.extend(build_tls_session(tls_version=0x0304, sni=None))

    wrpcap(output_file, packets)
    print(f"[+] ssl: {output_file} ({len(packets)} packets)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate SSL/TLS log test PCAP")
    parser.add_argument("-o", "--output", type=str, default="ssl.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_ssl_pcap(args.output)

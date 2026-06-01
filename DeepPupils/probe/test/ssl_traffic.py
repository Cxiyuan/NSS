#!/usr/bin/env python3
"""Generate TLS/SSL handshake PCAPs for ssl.log verification.

Crafts TCP sessions with TLS handshake records that Zeek detects
and logs as ssl.log entries:
- TLS 1.3 ClientHello with SNI extension
- TLS 1.2 ClientHello with SNI extension
- TLS 1.3 full handshake (ClientHello + ServerHello + Certificate)
- TLS connection with resumed session
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


def build_tls_record(content_type, version, payload):
    """Build a TLS record layer: content_type(1) + version(2) + length(2) + payload"""
    return struct.pack(">BHH", content_type, version, len(payload)) + payload


def build_tls_client_hello(tls_version=0x0303, sni=None, ciphers=None):
    """Build a TLS ClientHello handshake message."""
    # TLS record layer: Handshake(22), version
    random_bytes = bytes([random.randint(0, 255) for _ in range(32)])
    session_id = bytes([random.randint(0, 255) for _ in range(16)])

    if ciphers is None:
        ciphers = [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f]  # TLS 1.3 + 1.2 ciphers

    cipher_suites = b"".join(struct.pack(">H", c) for c in ciphers)
    compression = b"\x00"  # null compression

    extensions = b""

    # SNI extension (type 0)
    if sni:
        sni_bytes = sni.encode()
        sni_entry = struct.pack(">H", len(sni_bytes)) + sni_bytes
        sni_list = struct.pack(">H", len(sni_entry)) + sni_entry
        sni_ext = struct.pack(">HH", 0x0000, len(sni_list)) + sni_list
        extensions += sni_ext

    # Supported versions extension (type 43) - indicates TLS 1.3 capability
    if tls_version >= 0x0304:
        sv_ext = struct.pack(">HHB", 0x002b, 3, 2) + struct.pack(">H", tls_version)
        # Also add TLS 1.2 as supported
        sv_ext = struct.pack(">HHB", 0x002b, 5, 4) + struct.pack(">HH", 0x0303, tls_version)
        extensions += sv_ext

    # Supported groups extension
    groups = [0x001d, 0x0017, 0x0018]  # x25519, secp256r1, secp384r1
    groups_data = struct.pack(">H" + "H" * len(groups), len(groups) * 2, *groups)
    extensions += struct.pack(">HH", 0x000a, len(groups_data)) + groups_data

    # Signature algorithms extension
    sig_algs = [0x0804, 0x0805, 0x0403]  # rsa_pss_rsae_sha256, etc.
    sig_data = struct.pack(">H" + "H" * len(sig_algs), len(sig_algs) * 2, *sig_algs)
    extensions += struct.pack(">HH", 0x000d, len(sig_data)) + sig_data

    # ClientHello handshake body
    hello_version = 0x0303  # legacy version
    hello_body = struct.pack(">H", hello_version)
    hello_body += random_bytes
    hello_body += struct.pack("B", len(session_id)) + session_id
    hello_body += struct.pack(">H", len(cipher_suites)) + cipher_suites
    hello_body += struct.pack("B", len(compression)) + compression
    hello_body += struct.pack(">H", len(extensions)) + extensions

    # Handshake header: type=1 (ClientHello), length
    handshake_msg = struct.pack(">BI", 0x01, len(hello_body)) + hello_body

    return build_tls_record(0x16, 0x0301, handshake_msg)


def build_tls_server_hello(session_id=None):
    """Build a TLS 1.2 ServerHello handshake message."""
    random_bytes = bytes([random.randint(0, 255) for _ in range(32)])
    if session_id is None:
        session_id = bytes([random.randint(0, 255) for _ in range(16)])

    hello_version = 0x0303  # TLS 1.2
    cipher_suite = 0xc02b  # TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
    compression = 0x00

    hello_body = struct.pack(">H", hello_version)
    hello_body += random_bytes
    hello_body += struct.pack("B", len(session_id)) + session_id
    hello_body += struct.pack(">H", 2) + struct.pack(">H", cipher_suite)
    hello_body += struct.pack("B", 1) + struct.pack("B", compression)

    handshake_msg = struct.pack(">BI", 0x02, len(hello_body)) + hello_body
    return build_tls_record(0x16, 0x0303, handshake_msg)


def build_tls_certificate():
    """Build a basic TLS Certificate handshake message (self-signed dummy)."""
    # Dummy certificate data
    cert_data = bytes([random.randint(0, 255) for _ in range(128)])

    # Certificate message body (RFC 5246)
    cert_body = struct.pack(">I", len(cert_data) + 3)  # total cert chain length
    cert_body += struct.pack(">I", len(cert_data))  # first cert length
    cert_body += cert_data  # certificate data
    # Add extensions (empty for simplicity)
    cert_body += struct.pack(">H", 0)  # extensions length

    handshake_msg = struct.pack(">BI", 0x0b, len(cert_body)) + cert_body
    return build_tls_record(0x16, 0x0303, handshake_msg)


def build_tls_change_cipher_spec():
    """Build TLS ChangeCipherSpec message."""
    return build_tls_record(0x14, 0x0303, b"\x01")


def build_tls_finished():
    """Build TLS Finished handshake message (dummy)."""
    verify_data = bytes([random.randint(0, 255) for _ in range(12)])
    handshake_msg = struct.pack(">BI", 0x14, len(verify_data)) + verify_data
    return build_tls_record(0x16, 0x0303, handshake_msg)


def build_tls_handshake(tls_version=0x0303, sni=None, full_handshake=False):
    """Build packets for a TLS handshake TCP session."""
    packets = []
    src_ip = random_ip()
    dst_ip = random_ip()
    sport = random_port()
    dport = 443
    seq = random.randint(1000, 99999999)

    # TCP SYN
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='S', seq=seq))
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=seq + 1))
    client_seq = seq + 1
    server_seq = syn_ack_seq + 1
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq, ack=server_seq))

    # TLS ClientHello
    ch = build_tls_client_hello(tls_version=tls_version, sni=sni)
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=server_seq)
        / Raw(load=ch)
    )
    client_seq += len(ch)

    # ACK
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='A', seq=server_seq, ack=client_seq))

    if full_handshake:
        # ServerHello
        sh = build_tls_server_hello()
        server_data = sh

        # Certificate
        cert = build_tls_certificate()
        server_data += cert

        # ServerHelloDone
        sh_done_body = b""
        sh_done = struct.pack(">BI", 0x0e, 0) + sh_done_body
        server_data += build_tls_record(0x16, 0x0303, sh_done)

        packets.append(
            IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=server_seq, ack=client_seq)
            / Raw(load=server_data)
        )
        server_seq += len(server_data)

        # Client ACK + CCS + Finished
        packets.append(
            IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq, ack=server_seq))
        client_data = build_tls_change_cipher_spec() + build_tls_finished()
        packets.append(
            IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=server_seq)
            / Raw(load=client_data)
        )
        client_seq += len(client_data)

    # FIN
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_seq))
    packets.append(
        IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_seq, ack=client_seq + 1))
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq + 1, ack=server_seq + 1))

    return packets


def generate_ssl_pcap(output_file, session_count=3):
    """Generate PCAP with TLS/SSL handshakes."""
    packets = []

    # TLS 1.3 ClientHello (with SNI)
    packets.extend(build_tls_handshake(tls_version=0x0304, sni="example.com"))

    # TLS 1.2 ClientHello (with SNI)
    packets.extend(build_tls_handshake(tls_version=0x0303, sni="google.com"))

    # Full TLS 1.2 handshake (ClientHello + ServerHello + Certificate)
    packets.extend(build_tls_handshake(tls_version=0x0303, sni="github.com", full_handshake=True))

    # TLS 1.3 ClientHello without SNI
    packets.extend(build_tls_handshake(tls_version=0x0304, sni=None))

    wrpcap(output_file, packets)
    print(f"[+] ssl: {output_file} ({len(packets)} packets, 4 handshakes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate SSL/TLS log test PCAP")
    parser.add_argument("-o", "--output", type=str, default="ssl.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_ssl_pcap(args.output, args.count)

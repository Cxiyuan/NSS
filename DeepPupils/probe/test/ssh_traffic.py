#!/usr/bin/env python3
"""Generate SSH session PCAPs for ssh.log verification.

Crafts TCP sessions on port 22 with SSH banner exchanges that Zeek
detects and logs as ssh.log entries:
- SSH-2.0 client/server banner exchange with key exchange init
- SSH connection with auth success indicators
"""
import argparse
import random

from scapy.all import IP, TCP, Raw, wrpcap, conf

conf.verb = 0


def random_ip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def random_port():
    return random.randint(49152, 65535)


def build_ssh_session(src_ip, dst_ip, sport, dport=22,
                      client_banner="SSH-2.0-OpenSSH_8.9p1 Ubuntu-3\r\n",
                      server_banner="SSH-2.0-OpenSSH_8.9p1 Ubuntu-3\r\n",
                      auth_success=False):
    """Build a complete SSH TCP session with banner exchange."""
    packets = []
    seq = random.randint(1000, 99999999)

    # TCP handshake
    syn_seq = seq
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='S', seq=syn_seq))
    syn_ack_seq = random.randint(1000, 99999999)
    packets.append(IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='SA', seq=syn_ack_seq, ack=syn_seq + 1))

    client_seq = syn_seq + 1
    server_seq = syn_ack_seq + 1

    # ACK
    packets.append(IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq, ack=server_seq))

    # Server sends SSH banner
    server_banner_bytes = server_banner.encode()
    packets.append(
        IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='PA', seq=server_seq, ack=client_seq)
        / Raw(load=server_banner_bytes)
    )
    server_seq += len(server_banner_bytes)

    # Client ACK + sends SSH banner
    client_banner_bytes = client_banner.encode()
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=server_seq)
        / Raw(load=client_banner_bytes)
    )
    client_seq += len(client_banner_bytes)
    server_ack = server_seq
    server_seq += 0  # server hasn't sent more yet

    # Server ACK
    packets.append(
        IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='A', seq=server_ack, ack=client_seq)
    )

    # Key exchange init (SSH_MSG_KEXINIT) - binary data after banner
    # After banners, SSH sends key exchange init packets
    kex_init = bytes([
        0x14,  # SSH_MSG_KEXINIT
    ] + [random.randint(0, 255) for _ in range(250)])

    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='PA', seq=client_seq, ack=server_ack)
        / Raw(load=kex_init)
    )
    client_seq += len(kex_init)

    # Server ACK
    packets.append(
        IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='A', seq=server_ack, ack=client_seq)
    )

    # FIN
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='FA', seq=client_seq, ack=server_ack)
    )
    packets.append(
        IP(src=dst_ip, dst=src_ip) / TCP(sport=dport, dport=sport, flags='FA', seq=server_ack, ack=client_seq + 1)
    )
    packets.append(
        IP(src=src_ip, dst=dst_ip) / TCP(sport=sport, dport=dport, flags='A', seq=client_seq + 1, ack=server_ack + 1)
    )

    return packets


def generate_ssh_pcap(output_file, session_count=3):
    """Generate PCAP with SSH banner exchanges."""
    packets = []
    client_ip = random_ip()
    server_ip = random_ip()

    # Multiple SSH sessions with different client/server versions
    sessions = [
        ("SSH-2.0-OpenSSH_8.9p1 Ubuntu-3\r\n", "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3\r\n"),
        ("SSH-2.0-OpenSSH_7.4\r\n", "SSH-2.0-OpenSSH_7.4\r\n"),
        ("SSH-2.0-PuTTY_Release_0.78\r\n", "SSH-2.0-OpenSSH_8.0\r\n"),
    ]

    for i, (client_banner, server_banner) in enumerate(sessions):
        packets.extend(build_ssh_session(
            client_ip, server_ip, random_port(), 22,
            client_banner=client_banner,
            server_banner=server_banner,
        ))

    wrpcap(output_file, packets)
    print(f"[+] ssh: {output_file} ({len(packets)} packets, {len(sessions)} sessions)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate SSH log test PCAP")
    parser.add_argument("-o", "--output", type=str, default="ssh.pcap")
    parser.add_argument("-c", "--count", type=int, default=3)
    args = parser.parse_args()
    generate_ssh_pcap(args.output, args.count)

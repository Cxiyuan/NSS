#!/usr/bin/env python3
"""Verify drop_multicast.zeek: conn.log must have no multicast destination IPs."""
import re
import sys


def verify(conn_log_path):
    with open(conn_log_path) as f:
        lines = [l.strip() for l in f if l.strip() and not l.startswith('#')]

    # 验收点 1: conn.log 有单播连接记录
    if len(lines) == 0:
        print('[FAIL] conn.log empty — unicast traffic should be processed')
        sys.exit(1)
    print(f'[PASS] conn.log has {len(lines)} unicast connection(s)')

    # 验收点 2: 无组播目标 IP (224.0.0.0/4 或 ff00::/8)
    mcast_re = re.compile(r'^(22[4-9]\.|23[0-9]\.|ff0)')
    for line in lines:
        for field in line.split('\t'):
            if mcast_re.match(field):
                print(f'[FAIL] multicast IP found in conn.log: {field}')
                sys.exit(1)
    print('[PASS] no multicast IP in conn.log')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f'Usage: {sys.argv[0]} <conn.log>', file=sys.stderr)
        sys.exit(1)
    verify(sys.argv[1])

#!/usr/bin/env python3
"""
NTLM 预计算查表模块 — CPU 环境下秒级弱口令检测
"""

import argparse
import hashlib
import logging
import os
import sys
import time
from typing import Dict

logger = logging.getLogger('ntlm_lookup')


def ntlm_hash(password: str) -> str:
    return hashlib.new('md4', password.encode('utf-16le')).hexdigest().upper()


def sha1_hash(password: str) -> str:
    return hashlib.sha1(password.encode()).hexdigest().upper()


def md5_hash(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest().upper()


HASH_FUNCS = {'ntlm': ntlm_hash, 'sha1': sha1_hash, 'md5': md5_hash}


def build_lookup(wordlist_path: str, output_path: str,
                 algorithm: str = 'ntlm', max_lines: int = 100_000) -> int:
    hash_func = HASH_FUNCS[algorithm]
    count = 0
    start = time.time()

    with open(wordlist_path, 'r', errors='ignore') as f_in, \
         open(output_path, 'w') as f_out:
        for i, line in enumerate(f_in):
            if max_lines and i >= max_lines:
                break
            pwd = line.strip()
            if not pwd:
                continue
            f_out.write(f'{hash_func(pwd)}:{pwd}\n')
            count += 1
            if count % 100_000 == 0:
                logger.info(f'  Built {count:,} entries...')

    duration = time.time() - start
    logger.info(f'Built {count:,} {algorithm} entries in {duration:.1f}s')
    return count


def load_lookup(lookup_path: str) -> Dict[str, str]:
    lookup = {}
    with open(lookup_path, 'r', errors='ignore') as f:
        for line in f:
            if ':' not in line:
                continue
            h, pwd = line.strip().split(':', 1)
            lookup[h.strip().upper()] = pwd
    logger.info(f'Loaded {len(lookup):,} entries into lookup table')
    return lookup


def check_hash_file(lookup: Dict[str, str], hash_path: str,
                    algorithm: str = 'ntlm') -> list:
    results = []
    total = 0

    with open(hash_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total += 1

            if line.count(':') >= 3:
                parts = line.split(':')
                user = parts[0]
                nthash = parts[3].strip().upper() if len(parts) > 3 else ''
            else:
                user = 'unknown'
                nthash = line.strip().upper()

            if nthash and nthash in lookup:
                results.append({
                    'user': user, 'hash': nthash,
                    'plain': lookup[nthash], 'algorithm': algorithm,
                })

    logger.info(f'Checked {total:,} hashes, found {len(results):,} weak passwords')
    return results


def serve_api(lookup_path: str, host: str = '0.0.0.0', port: int = 8500):
    try:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        import json as jm
    except ImportError:
        logger.error('http.server required for API mode')
        sys.exit(1)

    lookup = load_lookup(lookup_path)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(jm.dumps({
                    'status': 'ok', 'entries': len(lookup),
                }).encode())
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            if self.path == '/check':
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode()
                try:
                    data = jm.loads(body)
                    h = data.get('hash', '').strip().upper()
                    plain = lookup.get(h)
                    result = {'found': plain is not None,
                              'hash': h, 'plain': plain}
                except Exception as e:
                    result = {'error': str(e)}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(jm.dumps(result).encode())
            else:
                self.send_response(404)
                self.end_headers()

    server = HTTPServer((host, port), Handler)
    logger.info(f'Lookup API on http://{host}:{port} ({len(lookup):,} entries)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


def main():
    parser = argparse.ArgumentParser(description='Cypher — NTLM Lookup')
    parser.add_argument('--build', help='Build lookup from wordlist')
    parser.add_argument('--check', help='Check hashes against lookup')
    parser.add_argument('--db', '-d', default='ntlm_precomputed.txt',
                        help='Lookup database path')
    parser.add_argument('--algorithm', choices=['ntlm', 'sha1', 'md5'],
                        default='ntlm')
    parser.add_argument('--max', type=int, default=100_000)
    parser.add_argument('--serve-api', action='store_true',
                        help='Start HTTP API server')
    parser.add_argument('--port', type=int, default=8500)
    parser.add_argument('--verbose', '-v', action='store_true')

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

    if args.build:
        build_lookup(args.build, args.db, args.algorithm, args.max)
    elif args.check:
        lookup = load_lookup(args.db)
        results = check_hash_file(lookup, args.check, args.algorithm)
        print(f'\nFound {len(results)} weak passwords:')
        for r in results[:50]:
            print(f'  [!] {r["user"]:20s} → {r["plain"]}')
        if len(results) > 50:
            print(f'  ... and {len(results) - 50} more')
    elif args.serve_api:
        serve_api(args.db, port=args.port)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()

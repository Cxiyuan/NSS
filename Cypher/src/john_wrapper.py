#!/usr/bin/env python3
"""
John the Ripper — Hashtopolis Generic Cracker Wrapper
"""

import argparse
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

from src.config import Config

logger = logging.getLogger('john_wrapper')

HASHCAT_MODE_MAP = {
    'ntlm': '1000', 'lm': '3000', 'sha512crypt': '1800',
    'sha256crypt': '7400', 'md5crypt': '500', 'bcrypt': '3200',
    'sha1': '100', 'sha256': '1400', 'sha512': '1700', 'md5': '0',
    'mscash': '1100', 'mscash2': '2100',
}

JOHN_FORMAT_MAP = {v: k for k, v in HASHCAT_MODE_MAP.items()}
JOHN_FORMAT_MAP.update({
    '0': 'raw-md5', '100': 'raw-sha1', '1000': 'ntlm',
    '1400': 'raw-sha256', '1700': 'raw-sha512', '1800': 'sha512crypt',
    '3000': 'lm', '3200': 'bcrypt', '500': 'md5crypt', '7400': 'sha256crypt',
    '1100': 'mscash', '2100': 'mscash2',
})


def detect_format(hash_string: str) -> str:
    h = hash_string.strip()
    if '$2a$' in h or '$2b$' in h or '$2y$' in h:
        return 'bcrypt'
    if '$6$' in h:
        return 'sha512crypt'
    if '$5$' in h:
        return 'sha256crypt'
    if '$1$' in h:
        return 'md5crypt'
    if ':' in h and len(h.split(':')[3]) == 32:
        return 'ntlm'
    return 'raw-sha256'


class JohnWrapper:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config.load()
        self._verify_john()

    def _verify_john(self):
        try:
            r = subprocess.run(
                [self.config.john_binary, '--version'],
                capture_output=True, text=True, timeout=10)
            logger.info(f'John version: {r.stdout.strip()}')
        except FileNotFoundError:
            raise RuntimeError(f'John binary not found: {self.config.john_binary}')

        r = subprocess.run(
            [self.config.john_binary, '--list=build-info'],
            capture_output=True, text=True, timeout=10)
        simd = r.stdout
        if 'AVX512' in simd:
            logger.info('✅ AVX512 support detected')
        elif 'AVX2' in simd:
            logger.info('⚠️  AVX2 only (AVX512 not available)')
        else:
            logger.warning('⚠️  No SIMD acceleration detected')

    def crack_hashlist(
        self, hash_path: str, wordlist_path: str,
        format_name: Optional[str] = None,
        rules: Optional[list] = None,
        timeout: Optional[int] = None,
    ) -> dict:
        fmt = format_name or detect_format(
            open(hash_path).readline() if os.path.exists(hash_path) else '')

        cmd = [
            self.config.john_binary,
            f'--format={fmt}',
            f'--wordlist={wordlist_path}',
            '--pot=stdout', hash_path,
        ]
        cmd.extend(self.config.john_flags)
        if rules:
            for rule in rules:
                cmd.append(f'--rules={rule}')

        logger.info(f'Running: {" ".join(cmd)}')
        start = time.time()

        try:
            r = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=timeout or self.config.john_timeout)
        except subprocess.TimeoutExpired:
            logger.warning(f'John timeout after {timeout}s')
            return {'cracked': 0, 'total': 0, 'results': [],
                    'speed': 'timeout', 'duration': timeout}

        duration = time.time() - start
        results = self._parse_results(r.stdout + '\n' + r.stderr, hash_path)
        speed = self._extract_speed(r.stdout + r.stderr)

        with open(hash_path) as f:
            total = sum(1 for _ in f)

        return {
            'cracked': len(results), 'total': total,
            'results': results, 'speed': speed,
            'duration': round(duration, 1),
        }

    def _parse_results(self, output: str, hash_path: str) -> list:
        results = []
        for line in output.splitlines():
            line = line.strip()
            if ':' not in line:
                continue
            if any(line.startswith(x) for x in
                   ('Loaded', 'Warning', 'Will run', 'Press')):
                continue
            parts = line.split(':', 1)
            if len(parts) == 2 and len(parts[1]) > 0 and len(parts[1]) < 128:
                results.append((parts[0].strip(), parts[1].strip()))
        return results

    def _extract_speed(self, output: str) -> str:
        m = re.search(r'(\d+[\d,]*[MGK]?)g/s', output)
        if m:
            return m.group(1) + 'g/s'
        m = re.search(r'(\d+[\d,]*)\s*c/s', output.replace(',', ''))
        if m:
            n = int(m.group(1).replace(',', ''))
            return f'{n/1_000_000:.1f}M c/s' if n > 1_000_000 else f'{n:,} c/s'
        return 'N/A'

    def serve_hashtopolis(self):
        logger.info('Starting Hashtopolis Generic Cracker mode...')
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                task = json.loads(line)
            except json.JSONDecodeError:
                continue

            fmt = JOHN_FORMAT_MAP.get(str(task.get('hashType', '1000')), 'ntlm')
            with tempfile.NamedTemporaryFile(mode='w', suffix='.hash', delete=False) as f:
                for h in task.get('hashes', []):
                    f.write(h + '\n')
                hash_path = f.name

            wordlist = task.get('wordlist', '')
            rules_list = [task['rules']] if task.get('rules') else None

            try:
                result = self.crack_hashlist(
                    hash_path=hash_path, wordlist_path=wordlist,
                    format_name=fmt, rules=rules_list,
                    timeout=task.get('timeout', 3600))
                output = {
                    'cracked': [{'hash': h, 'plain': p}
                                for h, p in result['results']],
                    'uncracked': [], 'speed': result['speed'],
                }
                print(json.dumps(output), flush=True)
            finally:
                os.unlink(hash_path)

    def generate_candidates(self, wordlist: str, rules: Optional[list] = None,
                            limit: int = 10000) -> list:
        cmd = [self.config.john_binary, f'--wordlist={wordlist}', '--stdout']
        if rules:
            for r in rules:
                cmd.append(f'--rules={r}')
        if limit:
            cmd.extend(['--limit', str(limit)])

        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        candidates = [
            line.strip() for line in r.stdout.splitlines()
            if line.strip() and ':' not in line[:20]]
        return candidates[:limit]


def main():
    parser = argparse.ArgumentParser(description='Cypher — John the Ripper Wrapper')
    parser.add_argument('--hashlist', help='Path to hash file')
    parser.add_argument('--wordlist', help='Path to wordlist')
    parser.add_argument('--format', help='Hash format')
    parser.add_argument('--rules', nargs='*', help='Rule files')
    parser.add_argument('--timeout', type=int, help='Timeout in seconds')
    parser.add_argument('--serve', action='store_true',
                        help='Hashtopolis Generic Cracker mode')
    parser.add_argument('--generate', type=int, metavar='N',
                        help='Generate N candidate passwords')
    parser.add_argument('--verbose', '-v', action='store_true')

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

    wrapper = JohnWrapper()

    if args.serve:
        wrapper.serve_hashtopolis()
    elif args.generate:
        candidates = wrapper.generate_candidates(
            args.wordlist or '/dev/null', args.rules, limit=args.generate)
        for c in candidates:
            print(c)
    elif args.hashlist:
        result = wrapper.crack_hashlist(
            args.hashlist, args.wordlist or '/dev/null',
            args.format, args.rules, args.timeout)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()


if __name__ == '__main__':
    main()

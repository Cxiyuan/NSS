#!/usr/bin/env python3
"""
在线弱口令探测引擎 — Hydra + Ncrack 封装
"""

import argparse
import csv
import logging
import os
import random
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

logger = logging.getLogger('online_scanner')


@dataclass
class ScanResult:
    target: str
    protocol: str
    port: int
    username: str
    password: str
    success: bool
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    duration_ms: int = 0


PROTOCOLS = {
    'ssh':      {'port': 22,  'hydra': 'ssh',           'ncrack': 'ssh',      'weight': 3.0},
    'rdp':      {'port': 3389,'hydra': 'rdp',           'ncrack': 'rdp',      'weight': 3.0},
    'mysql':    {'port': 3306,'hydra': 'mysql',         'ncrack': None,       'weight': 2.0},
    'smb':      {'port': 445, 'hydra': 'smb',           'ncrack': None,       'weight': 3.0},
    'postgres': {'port': 5432,'hydra': 'postgres',      'ncrack': None,       'weight': 2.0},
    'ftp':      {'port': 21,  'hydra': 'ftp',           'ncrack': 'ftp',      'weight': 1.5},
    'web-form': {'port': 80,  'hydra': 'http-post-form', 'ncrack': None,      'weight': 1.0},
}


class OnlineScanner:
    def __init__(self, wordlist: str = 'top_100.txt',
                 spray_delay: int = 30, timeout: int = 300,
                 dry_run: bool = False):
        self.wordlist = wordlist
        self.spray_delay = spray_delay
        self.timeout = timeout
        self.dry_run = dry_run
        self.results: List[ScanResult] = []

    def scan_target(self, target: str, protocols: List[str],
                    username: str = 'root') -> List[ScanResult]:
        target_results = []
        for proto in protocols:
            cfg = PROTOCOLS.get(proto)
            if not cfg:
                continue
            outfile = f'/tmp/scan_{target}_{proto}.txt'
            svc = cfg['hydra']
            if svc == 'http-post-form':
                cmd = (f'hydra -l {username} -P {self.wordlist} '
                       f'-t 2 -w 5 -o {outfile} '
                       f'{target} http-post-form '
                       f'"/login:user=^USER^&pass=^PASS^:F=incorrect"')
            else:
                cmd = (f'hydra -l {username} -P {self.wordlist} '
                       f'-t 4 -w 10 -o {outfile} {svc}://{target}')

            results = self._run(cmd, outfile, target, proto, cfg['port'], username)
            target_results.extend(results)
            time.sleep(random.uniform(1.0, 3.0))
        return target_results

    def password_spray(self, targets: List[str], password: str,
                       protocol: str = 'ssh', username: str = 'administrator'
                       ) -> List[ScanResult]:
        cfg = PROTOCOLS.get(protocol)
        if not cfg:
            return []
        results = []
        logger.info(f'Spraying {password!r} against {len(targets)} targets')

        for i, target in enumerate(targets):
            target = target.strip()
            if not target:
                continue
            start = time.time()
            outfile = f'/tmp/spray_{target}_{protocol}.txt'
            svc = cfg['hydra']
            if svc == 'http-post-form':
                cmd = (f'hydra -l {username} -p {password} '
                       f'-t 2 -w 5 -o {outfile} '
                       f'{target} http-post-form '
                       f'"/login:user=^USER^&pass=^PASS^:F=incorrect"')
            else:
                cmd = (f'hydra -l {username} -p {password} '
                       f'-t 2 -w 5 -o {outfile} {svc}://{target}')

            if self.dry_run:
                logger.info(f'[DRY-RUN] {cmd}')
                continue

            try:
                r = subprocess.run(cmd, shell=True, capture_output=True,
                                   text=True, timeout=self.timeout)
                elapsed = int((time.time() - start) * 1000)
                if r.returncode == 0:
                    results.append(ScanResult(
                        target=target, protocol=protocol,
                        port=cfg['port'], username=username,
                        password=password, success=True,
                        duration_ms=elapsed))
                    logger.info(f'  [!] {target}:{cfg["port"]} → {username}:{password}')
            except subprocess.TimeoutExpired:
                logger.warning(f'Timeout: {target}')
            finally:
                if os.path.exists(outfile):
                    try:
                        os.remove(outfile)
                    except OSError:
                        pass

            if i < len(targets) - 1:
                time.sleep(self.spray_delay + random.uniform(0, 5))
        return results

    def _run(self, cmd: str, outfile: str, target: str, protocol: str,
             port: int, username: str) -> List[ScanResult]:
        if self.dry_run:
            logger.info(f'[DRY-RUN] {cmd}')
            return []
        results = []
        try:
            start = time.time()
            r = subprocess.run(cmd, shell=True, capture_output=True,
                               text=True, timeout=self.timeout)
            elapsed = int((time.time() - start) * 1000)
            passwords = set()
            for line in (r.stdout + r.stderr).splitlines():
                m = re.search(r'password:\s*(\S+)', line)
                if m:
                    passwords.add(m.group(1))
            for pwd in passwords:
                results.append(ScanResult(
                    target=target, protocol=protocol, port=port,
                    username=username, password=pwd, success=True,
                    duration_ms=elapsed))
                logger.info(f'  [!] {target}:{port} → {username}:{pwd}')
        except subprocess.TimeoutExpired:
            logger.warning(f'Timeout: {target} ({protocol})')
        except Exception as e:
            logger.error(f'Error: {target} ({protocol}): {e}')
        finally:
            if os.path.exists(outfile):
                try:
                    os.remove(outfile)
                except OSError:
                    pass
        return results

    def generate_report(self, output: str = 'scan_report.csv'):
        with open(output, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['Target', 'Protocol', 'Port', 'Username',
                        'Password', 'Risk', 'Timestamp'])
            for r in self.results:
                risk = min(10.0, PROTOCOLS.get(r.protocol, {}).get('weight', 1.0) * 2.5)
                w.writerow([r.target, r.protocol, r.port, r.username,
                            r.password, risk, r.timestamp])
        logger.info(f'Report: {output}')


def main():
    parser = argparse.ArgumentParser(description='Cypher — Online Scanner')
    parser.add_argument('--targets', '-T', help='Target list file')
    parser.add_argument('--protocols', '-P', default='ssh')
    parser.add_argument('--username', '-u', default='root')
    parser.add_argument('--wordlist', '-w', default='top_100.txt')
    parser.add_argument('--spray', action='store_true')
    parser.add_argument('--password', help='Password for spraying')
    parser.add_argument('--delay', type=int, default=30)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--output', '-o', default='scan_report.csv')
    parser.add_argument('--verbose', '-v', action='store_true')

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

    scanner = OnlineScanner(args.wordlist, args.delay, dry_run=args.dry_run)
    protocols = [p.strip() for p in args.protocols.split(',')]

    if args.spray:
        if not args.password:
            logger.error('--password required for spray mode')
            sys.exit(1)
        with open(args.targets) as f:
            scanner.password_spray(f.readlines(), args.password,
                                   protocols[0], args.username)
    elif args.targets:
        with open(args.targets) as f:
            for target in f:
                target = target.strip()
                if target:
                    scanner.results.extend(
                        scanner.scan_target(target, protocols, args.username))
        scanner.generate_report(args.output)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()

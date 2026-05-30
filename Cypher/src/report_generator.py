#!/usr/bin/env python3
"""
风险评分与报告生成
"""

import argparse
import csv
import logging
import math
import os
from datetime import datetime

logger = logging.getLogger('report_generator')


def estimate_charset_size(password: str) -> int:
    size = 0
    if any(c.islower() for c in password):
        size += 26
    if any(c.isupper() for c in password):
        size += 26
    if any(c.isdigit() for c in password):
        size += 10
    if any(not c.isalnum() for c in password):
        size += 33
    return max(size, 1)


def calculate_entropy(password: str) -> float:
    return len(password) * math.log2(estimate_charset_size(password))


PROTOCOL_WEIGHT = {
    'ssh': 3.0, 'rdp': 3.0, 'smb': 3.0,
    'mysql': 2.0, 'postgres': 2.0, 'mssql': 2.0,
    'ftp': 1.5, 'http': 1.0, 'web-form': 1.0,
    'ntlm': 2.5, 'sha512crypt': 2.0,
}

PRIVILEGE_WEIGHT = {
    'domain_admin': 3.0, 'enterprise_admin': 3.0,
    'root': 3.0, 'administrator': 3.0,
    'local_admin': 2.0, 'db_admin': 2.0,
    'regular_user': 1.0,
    'service_account': 2.0,
}


def calculate_risk(password: str, protocol: str = 'ssh',
                   privilege: str = 'regular_user',
                   exposure: str = 'internal', reuse_count: int = 1) -> float:
    entropy = calculate_entropy(password)
    entropy_score = max(0.0, min(1.0, 1.0 - (entropy - 20) / 60))
    proto_w = PROTOCOL_WEIGHT.get(protocol.lower(), 1.0)
    priv_w = PRIVILEGE_WEIGHT.get(privilege.lower(), 1.0)
    exposure_w = {'public': 1.5, 'internal': 1.0, 'local': 0.8}.get(exposure, 1.0)
    reuse_penalty = min(reuse_count / 10, 1.0) * 0.5

    base = entropy_score * 0.4 + reuse_penalty * 0.15
    multiplier = (proto_w * priv_w * exposure_w) ** (1 / 3)

    score = base * multiplier * 10
    return round(min(score, 10.0), 1)


def risk_level(score: float) -> str:
    if score >= 8.0:
        return 'CRITICAL'
    if score >= 6.0:
        return 'HIGH'
    if score >= 4.0:
        return 'MEDIUM'
    if score >= 2.0:
        return 'LOW'
    return 'INFO'


def suggested_action(score: float, privilege: str) -> str:
    if score >= 8.0:
        return '立即轮换密码，启用 MFA'
    if score >= 6.0:
        return '72 小时内轮换密码'
    if score >= 4.0:
        return '计划轮换，纳入下次维护窗口'
    return '观察，酌情提醒'


def generate_html_report(findings: list, output: str = 'weak_password_report.html',
                         title: str = '弱口令检测报告') -> str:
    total = len(findings)
    critical = sum(1 for f in findings if risk_level(f['score']) == 'CRITICAL')
    high = sum(1 for f in findings if risk_level(f['score']) == 'HIGH')
    medium = sum(1 for f in findings if risk_level(f['score']) == 'MEDIUM')

    rows = []
    for f in findings:
        level = risk_level(f['score'])
        badge = {'CRITICAL': '#dc3545', 'HIGH': '#fd7e14',
                 'MEDIUM': '#ffc107', 'LOW': '#20c997', 'INFO': '#6c757d'}.get(level, '#6c757d')
        pwd = f.get('password', '')
        rows.append(f'''<tr>
<td>{f.get("user", f.get("username", "N/A"))}</td>
<td>{f.get("target", "N/A")}</td>
<td>{f.get("protocol", "N/A")}</td>
<td>{pwd[:3]}{"*"*max(0,len(pwd)-3)}</td>
<td><span style="background:{badge};color:#fff;padding:2px 8px;border-radius:4px">{level}</span></td>
<td>{f["score"]}</td>
<td>{suggested_action(f["score"], f.get("privilege","regular_user"))}</td>
</tr>''')

    html = f'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>{title}</title>
<style>
body{{font-family:-apple-system,sans-serif;margin:20px;color:#333}}
.summary{{display:flex;gap:20px;margin:20px 0}}
.stat{{padding:15px;border-radius:8px;min-width:100px;text-align:center;color:#fff}}
.stat.critical{{background:#dc3545}} .stat.high{{background:#fd7e14}}
.stat.medium{{background:#ffc107;color:#333}} .stat.low{{background:#20c997}}
table{{width:100%;border-collapse:collapse;margin-top:20px}}
th,td{{padding:8px 12px;text-align:left;border-bottom:1px solid #dee2e6}}
th{{background:#f8f9fa}} tr:hover{{background:#f1f3f5}}
</style></head><body>
<h1>{title}</h1>
<p>生成: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
<div class="summary">
<div class="stat critical">严重<br><strong>{critical}</strong></div>
<div class="stat high">高危<br><strong>{high}</strong></div>
<div class="stat medium">中危<br><strong>{medium}</strong></div>
</div>
<p>共 <strong>{total}</strong> 项弱口令发现</p>
<table><thead><tr><th>用户</th><th>目标</th><th>协议</th><th>密码</th><th>等级</th><th>评分</th><th>建议</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table>
<p style="color:#6c757d;font-size:12px;margin-top:30px">Cypher — 仅限授权安全评估用途</p>
</body></html>'''

    with open(output, 'w') as f:
        f.write(html)
    logger.info(f'HTML report: {output} ({total} findings)')
    return output


def generate_csv_report(findings: list, output: str = 'weak_password_report.csv'):
    with open(output, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['用户', '目标', '协议', '密码(脱敏)', '风险等级', '评分', '建议'])
        for f2 in findings:
            pwd = f2.get('password', '')
            w.writerow([
                f2.get('user', f2.get('username', 'N/A')),
                f2.get('target', 'N/A'), f2.get('protocol', 'N/A'),
                pwd[:3] + '*' * max(0, len(pwd) - 3),
                risk_level(f2['score']), f2['score'],
                suggested_action(f2['score'], f2.get('privilege', 'regular_user')),
            ])
    logger.info(f'CSV report: {output}')


def main():
    parser = argparse.ArgumentParser(description='Cypher — Report Generator')
    parser.add_argument('--cracked', help='CSV from offline cracking')
    parser.add_argument('--online', help='CSV from online scanning')
    parser.add_argument('--output', '-o', default='weak_password_report.html')
    parser.add_argument('--format', choices=['html', 'csv', 'both'], default='html')
    parser.add_argument('--verbose', '-v', action='store_true')

    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

    findings = []
    for src in [args.cracked, args.online]:
        if src and os.path.exists(src):
            with open(src) as f:
                for row in csv.DictReader(f):
                    row['score'] = calculate_risk(
                        row.get('password', ''), row.get('protocol', 'ntlm'))
                    findings.append(row)

    findings.sort(key=lambda x: x['score'], reverse=True)

    if args.format in ('html', 'both'):
        generate_html_report(findings, args.output)
    if args.format in ('csv', 'both'):
        generate_csv_report(findings, args.output.rsplit('.', 1)[0] + '.csv')


if __name__ == '__main__':
    main()

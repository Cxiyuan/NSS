#!/usr/bin/env python3
"""
业务定制弱口令词表生成器
"""

import argparse
import logging
import os

logger = logging.getLogger('custom_dict')


def generate(company: str, year: int = 2025, output: str = 'custom_dict.txt'):
    words = set()

    company_variants = [company.lower(), company.upper(), company.capitalize()]
    for v in company_variants:
        words.add(v)
        for y in [str(year), str(year)[2:]]:
            words.add(v + y)
            words.add(v + y + '!')
            words.add(v + '@' + y)
            words.add(v + '#' + y)

    seasons = ['Spring', 'Summer', 'Autumn', 'Winter', 'Q1', 'Q2', 'Q3', 'Q4']
    for s in seasons:
        words.add(s.lower() + str(year))
        words.add(s.capitalize() + str(year)[2:])

    words.update(['qwerty', '1qaz2wsx', 'qwerty123', 'asdfgh', 'zxcvbn',
                  'P@ssw0rd', 'p@ssw0rd', 'Passw0rd', 'Admin123', 'admin123'])

    with open(output, 'w') as f:
        for w in sorted(words):
            f.write(w + '\n')
    logger.info(f'Generated {len(words)} custom passwords → {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Cypher — Custom Dict Generator')
    parser.add_argument('--company', required=True)
    parser.add_argument('--year', type=int, default=2025)
    parser.add_argument('--output', '-o', default='custom_dict.txt')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    generate(args.company, args.year, args.output)

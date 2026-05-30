#!/usr/bin/env python3
"""
PCFG (Probabilistic Context-Free Grammar) 密码生成器
CPU 环境下训练轻量模型，生成按概率排序的候选密码
"""

import argparse
import json
import logging
import math
import random
from collections import Counter, defaultdict
from typing import List

logger = logging.getLogger('pcfg')


class PCFGModel:
    def __init__(self):
        self.base_words: Counter = Counter()
        self.digits_by_len: dict = defaultdict(Counter)
        self.specials_by_len: dict = defaultdict(Counter)
        self.structure_patterns: Counter = Counter()
        self.total_samples: int = 0

    def _tokenize(self, password: str) -> list:
        tokens = []
        cur_type, cur_val = None, ''
        for ch in password:
            t = ('BASE' if ch.isalpha() else 'DIGIT' if ch.isdigit() else 'SPECIAL')
            if t == cur_type:
                cur_val += ch
            else:
                if cur_val:
                    tokens.append((cur_type, cur_val))
                cur_type, cur_val = t, ch
        if cur_val:
            tokens.append((cur_type, cur_val))
        return tokens

    def train(self, passwords: List[str]):
        for pwd in passwords:
            if not pwd or len(pwd) < 3:
                continue
            self.total_samples += 1
            tokens = self._tokenize(pwd)
            parts = []
            for t, v in tokens:
                if t == 'BASE':
                    self.base_words[v.lower()] += 1
                    parts.append('BASE')
                elif t == 'DIGIT':
                    self.digits_by_len[len(v)][v] += 1
                    parts.append(f'D({len(v)})')
                elif t == 'SPECIAL':
                    self.specials_by_len[len(v)][v] += 1
                    parts.append(f'S({len(v)})')
            self.structure_patterns['_'.join(parts)] += 1
        logger.info(f'Trained on {self.total_samples:,} samples, '
                    f'{len(self.base_words):,} base words')

    def generate(self, count: int = 10000) -> List[str]:
        candidates = set()
        for pattern, pc in self.structure_patterns.most_common():
            if len(candidates) >= count:
                break
            prob = pc / max(1, self.total_samples)
            parts = pattern.split('_')
            for _ in range(max(1, int(count * prob * 2))):
                pwd = ''
                ok = True
                for part in parts:
                    if part == 'BASE':
                        if not self.base_words:
                            ok = False
                            break
                        pwd += self._sample(self.base_words)
                    elif part.startswith('D('):
                        d = self.digits_by_len.get(int(part[2:-1]))
                        if not d:
                            ok = False
                            break
                        pwd += self._sample(d)
                    elif part.startswith('S('):
                        s = self.specials_by_len.get(int(part[2:-1]))
                        if not s:
                            ok = False
                            break
                        pwd += self._sample(s)
                if ok and pwd:
                    candidates.add(pwd)
                if len(candidates) >= count:
                    break

        if len(candidates) < count:
            for w, _ in self.base_words.most_common(500):
                if len(candidates) >= count:
                    break
                for s in ['', '123', '123!', '1!', '@2025']:
                    candidates.add(w + s)
                    candidates.add(w.capitalize() + s)

        return list(candidates)[:count]

    def _sample(self, counter: Counter) -> str:
        total = sum(counter.values())
        r = random.random() * total
        cum = 0
        for item, c in counter.most_common():
            cum += c
            if r <= cum:
                return item
        return counter.most_common(1)[0][0]

    def save(self, path: str):
        data = {
            'total_samples': self.total_samples,
            'base_words': dict(self.base_words.most_common(5000)),
            'digits_by_len': {str(k): dict(v.most_common(100))
                              for k, v in self.digits_by_len.items()},
            'specials_by_len': {str(k): dict(v.most_common(50))
                                for k, v in self.specials_by_len.items()},
            'structure_patterns': dict(self.structure_patterns),
        }
        with open(path, 'w') as f:
            json.dump(data, f, ensure_ascii=False)
        logger.info(f'Model saved: {path}')

    @classmethod
    def load(cls, path: str) -> 'PCFGModel':
        model = cls()
        with open(path) as f:
            data = json.load(f)
        model.total_samples = data.get('total_samples', 0)
        model.base_words = Counter(data.get('base_words', {}))
        model.digits_by_len = {int(k): Counter(v)
                               for k, v in data.get('digits_by_len', {}).items()}
        model.specials_by_len = {int(k): Counter(v)
                                 for k, v in data.get('specials_by_len', {}).items()}
        model.structure_patterns = Counter(data.get('structure_patterns', {}))
        return model


def main():
    parser = argparse.ArgumentParser(description='Cypher — PCFG Generator')
    parser.add_argument('--train', help='Training wordlist')
    parser.add_argument('--generate', type=int, metavar='N')
    parser.add_argument('--model', default='pcfg_model.json')
    parser.add_argument('--output', '-o', default='pcfg_dict.txt')

    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')

    if args.train:
        with open(args.train, errors='ignore') as f:
            passwords = [l.strip() for l in f if l.strip()]
        model = PCFGModel()
        model.train(passwords)
        model.save(args.model)

    if args.generate:
        model = PCFGModel.load(args.model)
        candidates = model.generate(args.generate)
        with open(args.output, 'w') as f:
            for c in candidates:
                f.write(c + '\n')
        logger.info(f'Wrote {len(candidates)} candidates → {args.output}')

    if not args.train and not args.generate:
        parser.print_help()


if __name__ == '__main__':
    main()

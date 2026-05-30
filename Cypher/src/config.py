"""
Cypher — 全局配置
"""

import os
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    yaml = None


class Config:
    def __init__(self):
        self.john_binary: str = os.environ.get('CYPHER_JOHN_BIN', 'john')
        self.john_format: str = os.environ.get('CYPHER_JOHN_FORMAT', 'ntlm')
        self.john_threads: int = int(os.environ.get('CYPHER_JOHN_THREADS', '0'))
        self.john_timeout: int = int(os.environ.get('CYPHER_JOHN_TIMEOUT', '3600'))
        self.lookup_db: str = os.environ.get('CYPHER_LOOKUP_DB', '/data/lookup/ntlm_precomputed.txt')
        self.lookup_max: int = int(os.environ.get('CYPHER_LOOKUP_MAX', '100000'))
        self.spray_delay: int = int(os.environ.get('CYPHER_SPRAY_DELAY', '30'))
        self.protocol_timeout: int = int(os.environ.get('CYPHER_PROTO_TIMEOUT', '300'))
        self.report_output: str = os.environ.get('CYPHER_REPORT_OUTPUT', '/data/reports')
        self.report_format: str = os.environ.get('CYPHER_REPORT_FORMAT', 'csv')
        self.htp_api_url: Optional[str] = os.environ.get('CYPHER_HTP_API_URL')
        self.htp_token: Optional[str] = os.environ.get('CYPHER_HTP_TOKEN')

    @classmethod
    def load(cls, path: str = 'config.yaml') -> 'Config':
        cfg = cls()
        if yaml is None:
            return cfg
        p = Path(path)
        if not p.exists():
            return cfg
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        cfg._merge(data)
        return cfg

    def _merge(self, data: dict, prefix: str = ''):
        for k, v in data.items():
            key = prefix + k
            if isinstance(v, dict):
                self._merge(v, key + '_')
            elif hasattr(self, key):
                setattr(self, key, v)

    @property
    def john_flags(self) -> list:
        flags = []
        if self.john_threads > 0:
            flags.extend(['--fork', str(self.john_threads)])
        return flags

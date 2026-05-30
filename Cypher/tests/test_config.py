import os
from src.config import Config


class TestConfig:
    def test_defaults(self):
        cfg = Config()
        assert cfg.john_binary == 'john'
        assert cfg.lookup_max == 100_000
        assert cfg.spray_delay == 30

    def test_env_override(self):
        os.environ['CYPHER_JOHN_BIN'] = '/custom/john'
        os.environ['CYPHER_LOOKUP_MAX'] = '50000'
        cfg = Config()
        assert cfg.john_binary == '/custom/john'
        assert cfg.lookup_max == 50000
        del os.environ['CYPHER_JOHN_BIN']
        del os.environ['CYPHER_LOOKUP_MAX']

    def test_john_flags(self):
        cfg = Config()
        cfg.john_threads = 0
        assert cfg.john_flags == []
        cfg.john_threads = 8
        assert '--fork' in cfg.john_flags
        assert '8' in cfg.john_flags

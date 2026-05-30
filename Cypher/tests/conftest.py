import hashlib
import os
import tempfile

import pytest


@pytest.fixture
def sample_ntlm_hash():
    pwd = 'CYPHER_TEST'
    h = hashlib.new('md4', pwd.encode('utf-16le')).hexdigest().upper()
    return f'admin:1000:aad3b435b51404eeaad3b435b51404ee:{h}:::'


@pytest.fixture
def sample_hash_file(sample_ntlm_hash):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.hash', delete=False) as f:
        f.write(sample_ntlm_hash + '\n')
        f.write('user1:1000:no:31d6cfe0d16ae931b73c59d7e0c089c0:::\n')
        path = f.name
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def sample_wordlist():
    words = ['CYPHER_TEST', 'wrongpass', '123456', 'password', 'admin']
    with tempfile.NamedTemporaryFile(mode='w', suffix='.dict', delete=False) as f:
        for w in words:
            f.write(w + '\n')
        path = f.name
    yield path
    if os.path.exists(path):
        os.unlink(path)

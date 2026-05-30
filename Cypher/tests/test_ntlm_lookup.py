import os
import tempfile

from src.ntlm_lookup import ntlm_hash, build_lookup, load_lookup, check_hash_file


class TestNtlmHash:
    def test_known(self):
        assert ntlm_hash('test') == '0CB6948805F797BF2A82807973B89537'

    def test_empty(self):
        assert ntlm_hash('') == '31D6CFE0D16AE931B73C59D7E0C089C0'


class TestBuildLookup:
    def test_build(self):
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as wf:
            wf.write('password\n123456\nadmin\n')
            wordlist = wf.name
        outfile = tempfile.mktemp(suffix='.lookup.txt')
        try:
            count = build_lookup(wordlist, outfile, max_lines=10)
            assert count == 3
            with open(outfile) as f:
                assert len(f.readlines()) == 3
        finally:
            for p in [wordlist, outfile]:
                if os.path.exists(p):
                    os.unlink(p)


class TestLookup:
    def test_roundtrip(self):
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as wf:
            wf.write('testpass\n')
            wordlist = wf.name

        lookup_file = tempfile.mktemp(suffix='.lookup.txt')
        hash_file = tempfile.mktemp(suffix='.hash.txt')

        try:
            build_lookup(wordlist, lookup_file, max_lines=10)
            lookup = load_lookup(lookup_file)
            assert len(lookup) == 1

            h = ntlm_hash('testpass')
            with open(hash_file, 'w') as f:
                f.write(f'user:::{h}:::\n')

            results = check_hash_file(lookup, hash_file)
            assert len(results) == 1
            assert results[0]['plain'] == 'testpass'
        finally:
            for p in [wordlist, lookup_file, hash_file]:
                if os.path.exists(p):
                    os.unlink(p)

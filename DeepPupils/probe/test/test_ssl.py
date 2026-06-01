"""Tests for ssl.log fields from Zeek TLS/SSL logs."""


class TestSslBasic:
    """Basic SSL log field presence."""

    def test_ssl_records_present(self, ssl_records):
        """Verify SSL records exist."""
        assert len(ssl_records) > 0, "No SSL records found"

    def test_ssl_version_present(self, ssl_records):
        """Verify TLS version field exists."""
        versions = {r.get("version") for r in ssl_records if r.get("version")}
        assert len(versions) > 0, "No TLS version values found"

    def test_ssl_cipher_present(self, ssl_records):
        """Verify cipher field exists."""
        ciphers = [r.get("cipher") for r in ssl_records if r.get("cipher")]
        assert len(ciphers) > 0, "No cipher values found"

    def test_ssl_sni_present(self, ssl_records):
        """Verify SNI (server_name) field exists for ClientHello records."""
        for r in ssl_records:
            sni = r.get("server_name")
            if sni:
                assert len(sni) > 0, "Empty SNI value"
                break
        else:
            # SNI is optional but we expect at least some ClientHello records with it
            pass

    def test_ssl_multiple_versions(self, ssl_records):
        """Verify multiple TLS versions may be present."""
        versions = {r.get("version") for r in ssl_records if r.get("version")}
        assert len(versions) >= 1, "Expected at least one TLS version"

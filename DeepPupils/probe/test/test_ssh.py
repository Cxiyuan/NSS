"""Tests for ssh.log fields from Zeek SSH logs."""


class TestSshBasic:
    """Basic SSH log field presence."""

    def test_ssh_records_present(self, ssh_records):
        """Verify SSH records exist."""
        assert len(ssh_records) > 0, "No SSH records found"

    def test_ssh_version_present(self, ssh_records):
        """Verify client and server version fields exist."""
        clients = [r.get("client") for r in ssh_records if r.get("client")]
        servers = [r.get("server") for r in ssh_records if r.get("server")]
        assert len(clients) > 0, "No client version values found"
        assert len(servers) > 0, "No server version values found"

    def test_ssh_version_strings(self, ssh_records):
        """Verify SSH version strings contain expected identifiers."""
        for r in ssh_records:
            client = r.get("client", "")
            server = r.get("server", "")
            if client:
                assert "SSH-" in client, f"Unexpected client version: {client}"
            if server:
                assert "SSH-" in server, f"Unexpected server version: {server}"

    def test_ssh_multiple_versions(self, ssh_records):
        """Verify multiple SSH client/server versions are captured."""
        clients = {r.get("client") for r in ssh_records if r.get("client")}
        assert len(clients) >= 2, (
            f"Expected at least 2 different client versions, got {len(clients)}"
        )

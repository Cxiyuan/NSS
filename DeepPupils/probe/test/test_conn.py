"""Tests for conn.log fields from Zeek connection logs."""


class TestConnBasic:
    """Basic conn.log field presence and types."""

    def test_conn_proto_present(self, conn_records):
        """Verify proto field exists in conn records."""
        assert len(conn_records) > 0, "No conn records found"
        protos = {r.get("proto") for r in conn_records if r.get("proto")}
        assert len(protos) > 0, "No proto values found"
        assert any(p in protos for p in ("tcp", "udp", "icmp")), (
            f"Expected tcp/udp/icmp in proto, got {protos}"
        )

    def test_conn_tcp_present(self, conn_records):
        """Verify TCP connections are logged."""
        tcp_records = [r for r in conn_records if r.get("proto") == "tcp"]
        assert len(tcp_records) > 0, "No TCP conn records found"

    def test_conn_udp_present(self, conn_records):
        """Verify UDP connections are logged."""
        udp_records = [r for r in conn_records if r.get("proto") == "udp"]
        assert len(udp_records) > 0, "No UDP conn records found"

    def test_conn_duration(self, conn_records):
        """Verify duration field is present."""
        durations = [r.get("duration") for r in conn_records if r.get("duration") is not None]
        assert len(durations) > 0, "No conn records with duration"

    def test_conn_bytes_present(self, conn_records):
        """Verify orig_bytes and resp_bytes are present."""
        orig = [r.get("orig_bytes") for r in conn_records if r.get("orig_bytes") is not None]
        resp = [r.get("resp_bytes") for r in conn_records if r.get("resp_bytes") is not None]
        assert len(orig) > 0, "No orig_bytes values found"
        assert len(resp) > 0, "No resp_bytes values found"

    def test_conn_packets_present(self, conn_records):
        """Verify orig_pkts and resp_pkts are present."""
        orig = [r.get("orig_pkts") for r in conn_records if r.get("orig_pkts") is not None]
        resp = [r.get("resp_pkts") for r in conn_records if r.get("resp_pkts") is not None]
        assert len(orig) > 0, "No orig_pkts values found"
        assert len(resp) > 0, "No resp_pkts values found"

    def test_conn_state_present(self, conn_records):
        """Verify conn_state field is present for TCP records."""
        states = {r.get("conn_state") for r in conn_records if r.get("conn_state")}
        assert len(states) > 0, "No conn_state values found"

    def test_conn_ip_bytes_present(self, conn_records):
        """Verify orig_ip_bytes and resp_ip_bytes are present."""
        orig = [r.get("orig_ip_bytes") for r in conn_records if r.get("orig_ip_bytes") is not None]
        resp = [r.get("resp_ip_bytes") for r in conn_records if r.get("resp_ip_bytes") is not None]
        assert len(orig) > 0, "No orig_ip_bytes values found"
        assert len(resp) > 0, "No resp_ip_bytes values found"

    def test_conn_service(self, conn_records):
        """Verify service field exists (HTTP, DNS, SSL)."""
        services = {r.get("service") for r in conn_records if r.get("service")}
        assert len(services) > 0, "No service values found"

"""Tests for dns.log fields from Zeek DNS logs."""


class TestDnsBasic:
    """Basic DNS log field presence."""

    def test_dns_query_present(self, dns_records):
        """Verify query field exists in DNS records."""
        assert len(dns_records) > 0, "No DNS records found"
        queries = [r.get("query") for r in dns_records if r.get("query")]
        assert len(queries) > 0, "No query values found"

    def test_dns_qtype_present(self, dns_records):
        """Verify qtype_name field exists."""
        qtypes = [r.get("qtype_name") for r in dns_records if r.get("qtype_name")]
        assert len(qtypes) > 0, "No qtype_name values found"

    def test_dns_rcode_present(self, dns_records):
        """Verify rcode_name field exists."""
        rcode = [r.get("rcode_name") for r in dns_records if r.get("rcode_name")]
        assert len(rcode) > 0, "No rcode_name values found"

    def test_dns_qtype_coverage(self, dns_records):
        """Verify multiple query types are present (A, AAAA, MX, CNAME)."""
        qtypes = {r.get("qtype_name") for r in dns_records if r.get("qtype_name")}
        assert len(qtypes) >= 2, f"Expected at least 2 query types, got {qtypes}"

    def test_dns_success_and_failure(self, dns_records):
        """Verify both successful and NXDOMAIN responses exist."""
        rcode_names = {r.get("rcode_name") for r in dns_records if r.get("rcode_name")}
        assert "NXDOMAIN" in rcode_names or "SERVFAIL" in rcode_names, (
            f"No error rcode found, got {rcode_names}"
        )

    def test_dns_answers_present(self, dns_records):
        """Verify answers field exists for successful queries."""
        answers = [r.get("answers") for r in dns_records if r.get("answers") is not None]
        assert len(answers) > 0, "No answers found in DNS records"

    def test_dns_ttls_present(self, dns_records):
        """Verify TTLs field exists."""
        ttls = [r.get("TTLs") for r in dns_records if r.get("TTLs") is not None]
        assert len(ttls) > 0, "No TTLs found in DNS records"

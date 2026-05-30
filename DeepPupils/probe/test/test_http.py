import pytest


class TestAuth:
    """Authorization header tests."""

    def test_auth_basic(self, http_records):
        """Verify Basic Authorization header exists and is in correct format."""
        auth_records = [r for r in http_records if r.get("authorizations")]
        assert len(auth_records) > 0, "No Authorization records found"
        for r in auth_records:
            auth_val = str(r.get("authorizations", ""))
            assert "Basic" in auth_val or "Bearer" in auth_val or "Proxy" in auth_val

    def test_auth_bearer(self, http_records):
        """Verify Bearer Token Authorization exists."""
        auth_records = [r for r in http_records if r.get("authorizations")]
        assert len(auth_records) > 0, "No Authorization records found"
        bearer_found = False
        for r in auth_records:
            auth_val = str(r.get("authorizations", ""))
            if auth_val.startswith("Bearer"):
                bearer_found = True
                # Verify it's a proper JWT-like token
                assert "eyJ" in auth_val, "Bearer token should be a JWT"
                break
        assert bearer_found, "Bearer token not found in Authorization records"

    def test_auth_proxy(self, http_records):
        """Verify Proxy-Authorization exists."""
        proxy_records = [r for r in http_records if r.get("proxy_authorization")]
        assert len(proxy_records) > 0, "No Proxy-Authorization records found"
        for r in proxy_records:
            val = str(r.get("proxy_authorization", ""))
            assert val != "", "Proxy-Authorization value is empty"


class TestProxy:
    """Proxy forwarding header tests."""

    def test_xff_chain(self, http_records):
        """Verify X-Forwarded-For contains expected IPs."""
        xff_records = [r for r in http_records if r.get("xff")]
        assert len(xff_records) > 0, "No X-Forwarded-For records found"
        for r in xff_records:
            xff_val = str(r.get("xff", ""))
            assert "203.0.113.195" in xff_val, f"Expected IP not found in XFF: {xff_val}"

    def test_xff_real_ip(self, http_records):
        """Verify X-Real-IP value."""
        xff_records = [r for r in http_records if r.get("xff")]
        assert len(xff_records) > 0, "No X-Forwarded-For records found"
        real_ip_found = False
        for r in xff_records:
            xff_val = str(r.get("xff", ""))
            if "203.0.113.195" in xff_val:
                real_ip_found = True
                break
        assert real_ip_found, "X-Real-IP not found"


class TestCookies:
    """Cookie / Set-Cookie tests."""

    def test_cookie_session(self, http_records):
        """Verify Cookie sessionid value."""
        cookie_records = [r for r in http_records if r.get("cookies")]
        assert len(cookie_records) > 0, "No cookie records found"
        for r in cookie_records:
            cookies_val = str(r.get("cookies", ""))
            assert "sessionid" in cookies_val, f"sessionid not found in cookies: {cookies_val}"

    def test_cookie_httponly(self, http_records):
        """Verify Set-Cookie HttpOnly attribute."""
        set_cookie_records = [r for r in http_records if r.get("set_cookie")]
        assert len(set_cookie_records) > 0, "No Set-Cookie records found"
        httponly_found = False
        for r in set_cookie_records:
            val = str(r.get("set_cookie", ""))
            if "HttpOnly" in val or "httpOnly" in val:
                httponly_found = True
                break
        assert httponly_found, "HttpOnly attribute not found in Set-Cookie"

    def test_cookie_samesite(self, http_records):
        """Verify SameSite attribute in Set-Cookie."""
        set_cookie_records = [r for r in http_records if r.get("set_cookie")]
        assert len(set_cookie_records) > 0, "No Set-Cookie records found"
        samesite_found = False
        for r in set_cookie_records:
            val = str(r.get("set_cookie", ""))
            if "SameSite" in val or "samesite" in val:
                samesite_found = True
                break
        assert samesite_found, "SameSite attribute not found in Set-Cookie"


class TestBody:
    """Request/response body tests."""

    def test_body_json(self, http_records):
        """Verify JSON body parses correctly."""
        json_body_records = [r for r in http_records if r.get("req_body")]
        assert len(json_body_records) > 0, "No body records found"
        json_found = False
        for r in json_body_records:
            body_val = str(r.get("req_body", ""))
            if "username" in body_val and "password" in body_val:
                json_found = True
                break
        assert json_found, "JSON body with username/password not found"

    def test_body_form(self, http_records):
        """Verify form-urlencoded body parses correctly."""
        json_body_records = [r for r in http_records if r.get("req_body")]
        assert len(json_body_records) > 0, "No body records found"
        form_found = False
        for r in json_body_records:
            body_val = str(r.get("req_body", ""))
            if "username=admin" in body_val and "password=admin" in body_val:
                form_found = True
                break
        assert form_found, "Form body with username/password not found"

    def test_body_multipart(self, http_records):
        """Verify multipart body parses correctly."""
        json_body_records = [r for r in http_records if r.get("req_body")]
        assert len(json_body_records) > 0, "No body records found"
        multipart_found = False
        for r in json_body_records:
            body_val = str(r.get("req_body", ""))
            if "bound" in body_val and "Content-Disposition" in body_val:
                multipart_found = True
                break
        assert multipart_found, "Multipart body not found"

    def test_body_xml(self, http_records):
        """Verify XML body parses correctly."""
        json_body_records = [r for r in http_records if r.get("req_body")]
        assert len(json_body_records) > 0, "No body records found"
        xml_found = False
        for r in json_body_records:
            body_val = str(r.get("req_body", ""))
            if "soap:Envelope" in body_val or "xml" in body_val.lower():
                xml_found = True
                break
        assert xml_found, "XML body not found"


class TestHeaders:
    """Request/response header completeness tests."""

    def test_request_headers(self, http_records):
        """Verify standard request header fields exist."""
        expected_fields = ["host", "uri", "user_agent", "accept", "accept_language", "accept_encoding"]
        for r in http_records:
            for field in expected_fields:
                assert field in r, f"Missing request header field: {field}"

    def test_response_headers(self, http_records):
        """Verify standard response header fields exist."""
        expected_fields = ["status_code", "content_type", "content_length"]
        for r in http_records:
            for field in expected_fields:
                assert field in r, f"Missing response header field: {field}"


class TestMethods:
    """HTTP method tests."""

    def test_http_methods(self, http_records):
        """Verify GET/POST/PUT/DELETE/HEAD/OPTIONS method support."""
        methods_in_log = set(r.get("method") for r in http_records)
        expected_methods = {"GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"}
        assert expected_methods.issubset(methods_in_log), f"Missing methods: {expected_methods - methods_in_log}"


class TestStatus:
    """HTTP status code tests."""

    def test_http_status_2xx(self, http_records):
        """Verify 200/201/204 status codes."""
        status_codes = [r.get("status_code") for r in http_records if r.get("status_code")]
        assert 200 in status_codes or 201 in status_codes or 204 in status_codes, "No 2xx status codes found"

    def test_http_status_3xx(self, http_records):
        """Verify 301/302 redirect status codes."""
        status_codes = [r.get("status_code") for r in http_records if r.get("status_code")]
        assert 301 in status_codes or 302 in status_codes, "No 3xx redirect status codes found"

    def test_http_status_4xx(self, http_records):
        """Verify 400/401/403/404 client error status codes."""
        status_codes = [r.get("status_code") for r in http_records if r.get("status_code")]
        found_4xx = any(code in status_codes for code in [400, 401, 403, 404])
        assert found_4xx, "No 4xx client error status codes found"

    def test_http_status_5xx(self, http_records):
        """Verify 500/502/503 server error status codes."""
        status_codes = [r.get("status_code") for r in http_records if r.get("status_code")]
        found_5xx = any(code in status_codes for code in [500, 502, 503])
        assert found_5xx, "No 5xx server error status codes found"


class TestBoundary:
    """Boundary stability tests."""

    def test_boundary_no_crash(self, zeek_results):
        """Verify Zeek has no crash under boundary conditions, all JSON files generated."""
        boundary_scenarios = [
            "http_boundary_large_header",
            "http_boundary_large_body",
            "http_boundary_special_char",
            "http_boundary_mixed_encoding",
        ]
        for scenario in boundary_scenarios:
            assert scenario in zeek_results, f"Scenario {scenario} has no output, Zeek may have crashed or file is missing"


class TestMulticast:
    """drop_multicast.zeek verification."""

    def test_multicast_unicast_present(self, zeek_results):
        """单播 HTTP 流量应被正常处理，产出 http_multicast.json。"""
        assert "http_multicast" in zeek_results, (
            "http_multicast.json missing — unicast traffic should be processed"
        )
        records = zeek_results["http_multicast"]
        http_records = [r for r in records if r.get("kind") == "http"]
        assert len(http_records) >= 2, (
            f"Expected >=2 unicast HTTP records, got {len(http_records)}"
        )
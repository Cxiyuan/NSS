import os
import tempfile

from src.report_generator import (
    estimate_charset_size, calculate_entropy, calculate_risk,
    risk_level, generate_html_report, generate_csv_report,
)


class TestEntropy:
    def test_charset_lower(self):
        assert estimate_charset_size('abc') == 26

    def test_charset_mixed(self):
        assert estimate_charset_size('Ab1!') == 95

    def test_entropy_weak(self):
        assert calculate_entropy('123456') < 30

    def test_entropy_strong(self):
        assert calculate_entropy('P@ssw0rd!2025#') > 60


class TestRiskScoring:
    def test_weak_high(self):
        assert calculate_risk('123456', privilege='root',
                              exposure='public') >= 6.0

    def test_strong_low(self):
        assert calculate_risk('kH9#mP2$xL7@vQ5!',
                              privilege='regular_user',
                              exposure='local') <= 5.0

    def test_privilege_impact(self):
        admin = calculate_risk('password', privilege='domain_admin')
        user = calculate_risk('password', privilege='regular_user')
        assert admin > user

    def test_protocol_impact(self):
        ssh = calculate_risk('password', protocol='ssh')
        web = calculate_risk('password', protocol='web-form')
        assert ssh > web

    def test_bounds(self):
        assert calculate_risk('x' * 100) >= 0
        assert calculate_risk('1', privilege='domain_admin',
                              exposure='public') <= 10.0


class TestRiskLevel:
    def test_critical(self):
        assert risk_level(8.5) == 'CRITICAL'

    def test_high(self):
        assert risk_level(6.5) == 'HIGH'

    def test_medium(self):
        assert risk_level(5.0) == 'MEDIUM'

    def test_low(self):
        assert risk_level(3.0) == 'LOW'


class TestReport:
    def test_html(self):
        findings = [{'user': 'admin', 'target': 's1', 'protocol': 'ssh',
                     'password': '123456', 'score': 9.0, 'privilege': 'root'}]
        out = tempfile.mktemp(suffix='.html')
        try:
            result = generate_html_report(findings, out)
            assert os.path.exists(result)
            with open(result) as f:
                assert '<html' in f.read()
        finally:
            if os.path.exists(out):
                os.unlink(out)

    def test_csv(self):
        findings = [{'user': 'admin', 'password': '123456', 'score': 9.0}]
        out = tempfile.mktemp(suffix='.csv')
        try:
            generate_csv_report(findings, out)
            with open(out) as f:
                assert len(f.readlines()) == 2
        finally:
            if os.path.exists(out):
                os.unlink(out)

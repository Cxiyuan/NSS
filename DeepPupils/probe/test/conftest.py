import json
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def zeek_results():
    """Load all zeek JSON output files (NDJSON format)."""
    results = {}
    zeek_output_dir = Path(__file__).parent / "zeek_output"
    if not zeek_output_dir.exists():
        return results
    for json_file in zeek_output_dir.glob("*.json"):
        records = []
        with open(json_file) as f:
            for line in f:
                line = line.strip()
                if line and line.startswith("{"):
                    try:
                        record = json.loads(line)
                        if record.get("kind") != "treelike":
                            records.append(record)
                    except json.JSONDecodeError:
                        continue
        results[json_file.stem] = records
    return results


def _get_records_by_kind(zeek_results, kind):
    """Get all records of a given kind, annotated by scenario."""
    all_records = []
    for scenario, records in zeek_results.items():
        for record in records:
            if record.get("kind") == kind and kind in record:
                obj = record[kind]
                obj["_scenario"] = scenario
                all_records.append(obj)
    return all_records


@pytest.fixture(scope="session")
def http_records(zeek_results):
    """Get all HTTP records (http sub-object), annotated by scenario."""
    return _get_records_by_kind(zeek_results, "http")


@pytest.fixture(scope="session")
def dns_records(zeek_results):
    """Get all DNS records (dns sub-object), annotated by scenario."""
    return _get_records_by_kind(zeek_results, "dns")


@pytest.fixture(scope="session")
def ssh_records(zeek_results):
    """Get all SSH records (ssh sub-object), annotated by scenario."""
    return _get_records_by_kind(zeek_results, "ssh")


@pytest.fixture(scope="session")
def ssl_records(zeek_results):
    """Get all SSL records (ssl sub-object), annotated by scenario."""
    return _get_records_by_kind(zeek_results, "ssl")


@pytest.fixture(scope="session")
def conn_records(zeek_results):
    """Get all Conn records (conn sub-object), annotated by scenario."""
    return _get_records_by_kind(zeek_results, "conn")


@pytest.fixture(scope="session")
def get_by_scenario(zeek_results):
    """Get records by scenario name and kind."""
    def _get(scenario_name, kind="http"):
        records = zeek_results.get(scenario_name, [])
        return [r[kind] for r in records if r.get("kind") == kind and kind in r]
    return _get
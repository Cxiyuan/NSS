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


@pytest.fixture(scope="session")
def http_records(zeek_results):
    """Get all HTTP records (http sub-object), annotated by scenario."""
    all_records = []
    for scenario, records in zeek_results.items():
        for record in records:
            if record.get("kind") == "http" and "http" in record:
                http_obj = record["http"]
                http_obj["_scenario"] = scenario
                all_records.append(http_obj)
    return all_records


@pytest.fixture(scope="session")
def get_by_scenario(zeek_results):
    """Get http sub-objects by scenario name."""
    def _get(scenario_name):
        records = zeek_results.get(scenario_name, [])
        return [r["http"] for r in records if r.get("kind") == "http" and "http" in r]
    return _get
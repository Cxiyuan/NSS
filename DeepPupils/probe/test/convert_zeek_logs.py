#!/usr/bin/env python3
"""Convert zeek TSV log to NDJSON for CI assertions."""
import json
import sys
import os


def convert_log(log_path, output_path, kind="http"):
    if not os.path.exists(log_path):
        open(output_path, 'w').close()
        return 0

    with open(log_path) as f:
        lines = f.readlines()

    fields = []
    for line in lines:
        if line.startswith('#fields'):
            fields = line.strip().split('\t')[1:]

    if not fields:
        open(output_path, 'w').close()
        return 0

    numeric_fields = {
        'status_code', 'trans_depth', 'request_body_len',
        'response_body_len', 'content_length',
        'total_bytes', 'seen_bytes',
    }

    records = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) != len(fields):
            continue

        flat = {}
        for i, val in enumerate(parts):
            key = fields[i]
            if val == '-':
                flat[key] = None if key in numeric_fields else ''
            elif key in numeric_fields:
                try:
                    flat[key] = int(val)
                except ValueError:
                    flat[key] = val
            else:
                flat[key] = val

        flat['kind'] = kind

        sub_obj = {k: v for k, v in flat.items()
                   if k not in ('ts', 'uid', 'kind')}
        flat[kind] = sub_obj

        records.append(flat)

    with open(output_path, 'w') as f:
        for rec in records:
            f.write(json.dumps(rec) + '\n')

    return len(records)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <log> <output.json> [kind]", file=sys.stderr)
        sys.exit(1)
    kind = sys.argv[3] if len(sys.argv) > 3 else "http"
    count = convert_log(sys.argv[1], sys.argv[2], kind)
    print(f"Converted {count} records")

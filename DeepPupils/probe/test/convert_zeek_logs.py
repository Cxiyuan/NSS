#!/usr/bin/env python3
"""Convert zeek http.log (TSV) to JSON array for CI assertions."""
import json
import sys
import os


def convert_http_log(log_path, output_path):
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

    numeric_fields = {'status_code', 'trans_depth', 'request_body_len',
                      'response_body_len', 'content_length'}

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

        flat['kind'] = 'http'

        http_obj = {k: v for k, v in flat.items()
                    if k not in ('ts', 'uid', 'kind')}
        flat['http'] = http_obj

        records.append(flat)

    with open(output_path, 'w') as f:
        for rec in records:
            f.write(json.dumps(rec) + '\n')

    return len(records)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <http.log> <output.json>", file=sys.stderr)
        sys.exit(1)
    count = convert_http_log(sys.argv[1], sys.argv[2])
    print(f"Converted {count} records")

#!/usr/bin/env python3
"""Print counts only: raw findings may contain secrets and must not be published."""
import collections
import json
import sys

with open(sys.argv[1]) as source:
    report = json.load(source)
if report.get('status') != 'success' or report.get('errors'):
    raise SystemExit('NO-GO: scanner incomplete or tool errors; inspect private logs')
findings = report.get('analysisVulnerabilities')
if not isinstance(findings, list):
    raise SystemExit('NO-GO: invalid scanner report')
counts = collections.Counter(item['vulnerabilities']['severity'] for item in findings)
print(json.dumps({'severity_counts': dict(counts), 'policy': 'Block all LOW/MEDIUM/HIGH/CRITICAL/UNKNOWN; INFO only is informational'}))
raise SystemExit(1 if any(count for severity, count in counts.items() if severity != 'INFO') else 0)

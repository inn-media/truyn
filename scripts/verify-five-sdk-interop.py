#!/usr/bin/env python3
"""Verify frozen SDK payloads and exact-revision mixed-version test evidence.

Offline verifier only: no credentials, cloud calls, publication or stable admission.
"""
import argparse
import hashlib
import io
import itertools
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PIN_PATH = ROOT / 'spec/compatibility/truyn1-five-sdk-digests.json'
LANGUAGES = ('typescript', 'python', 'go', 'java', 'dotnet')
SOURCE = '57971b134a41c3e3ea4b42f68e86a7d117036006'
LIMIT = 16 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_json_key')
        result[key] = value
    return result


def loads(data):
    return json.loads(data, object_pairs_hook=unique_object)


def read_pins():
    raw = PIN_PATH.read_bytes()
    pins = loads(raw)
    if (pins.get('schema') != 'truyn.five-sdk-digests/v1'
            or pins.get('sourceSha') != SOURCE
            or set(pins.get('packages', {})) != set(LANGUAGES)):
        raise ValueError('invalid_frozen_sdk_pins')
    return pins, sha(raw)


def bounded_file(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > LIMIT:
        raise ValueError('invalid_or_oversized_package_file')
    return path.read_bytes()


def zip_payload(data, prefix=''):
    payload = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 1024:
            raise ValueError('too_many_archive_members')
        seen = set()
        for member in entries:
            name = member.filename
            if (name in seen or name.startswith('/') or '\\' in name
                    or any(p in ('..', '.') for p in name.split('/'))
                    or stat.S_ISLNK(member.external_attr >> 16)):
                raise ValueError('unsafe_or_duplicate_archive_member')
            seen.add(name)
            if prefix and not name.startswith(prefix):
                raise ValueError('wrong_go_module_prefix')
            if member.is_dir():
                continue
            total += member.file_size
            if total > LIMIT:
                raise ValueError('expanded_archive_too_large')
            key = name[len(prefix):]
            if not key or PurePosixPath(key).is_absolute():
                raise ValueError('unsafe_archive_member')
            payload[key] = sha(archive.read(member))
    return payload


def verify_package(kind, data, definition):
    if kind not in LANGUAGES:
        raise ValueError('unknown_sdk')
    mode = definition['mode']
    if mode == 'archive-sha256':
        if len(data) != definition['bytes'] or sha(data) != definition['sha256']:
            raise ValueError('frozen_archive_digest_mismatch:' + kind)
        checked = None
    else:
        expected_mode = {'go': 'go-proxy-source-payload', 'dotnet': 'nuget-signed-package-payload'}
        if expected_mode.get(kind) != mode:
            raise ValueError('invalid_package_comparison_mode')
        payload = zip_payload(data, definition.get('zipPrefix', ''))
        if kind == 'dotnet':
            for name in definition['allowedSigningEnvelopeMembers']:
                payload.pop(name, None)
        if payload != definition['files']:
            raise ValueError('frozen_package_payload_mismatch:' + kind)
        checked = len(payload)
    return {'id': kind, 'coordinate': definition['coordinate'], 'comparison': mode,
            'archiveBytes': len(data), 'archiveSha256': sha(data),
            'checkedPayloadFiles': checked, 'status': 'PASS'}


def validate_matrix(log):
    marker = log.find('\n{')
    if marker < 0:
        raise ValueError('missing_matrix_json')
    report = loads(log[marker + 1:])
    expected = set(itertools.product(LANGUAGES, ('legacy', 'candidate'), ('legacy', 'candidate')))
    rows = report.get('outcomes', [])
    if report.get('schema') != 'truyn.legacy-sdk-matrix/1' or report.get('status') != 'PASS' or len(rows) != 20:
        raise ValueError('invalid_matrix_summary')
    actual = [(r.get('language'), r.get('provider'), r.get('requester')) for r in rows]
    if set(actual) != expected or len(set(actual)) != 20 or any(r.get('status') != 'PASS' for r in rows):
        raise ValueError('missing_duplicate_or_failed_matrix_case')
    lines = log[:marker].splitlines()
    expected_lines = {f'PASS {a} {b} provider -> {c} requester' for a, b, c in expected}
    if len(lines) != 20 or set(lines) != expected_lines:
        raise ValueError('matrix_text_json_disagree')
    return rows


def execution_context():
    expected = os.environ.get('TRUYN_EXPECTED_SOURCE_SHA', '')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if not re.fullmatch('[0-9a-f]{40}', expected) or actual != expected:
        raise ValueError('exact_source_sha_mismatch')
    subprocess.run(['git', 'diff', '--exit-code', '--quiet', 'HEAD', '--'], cwd=ROOT, check=True)
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '')
    if not run_id.isdigit() or int(run_id) < 1 or not attempt.isdigit() or int(attempt) < 1:
        raise ValueError('missing_ci_run_identity')
    return {'sourceSha': actual, 'sourceTree': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD^{tree}'], cwd=ROOT, text=True).strip(),
        'runId': int(run_id), 'runAttempt': int(attempt), 'event': os.environ.get('GITHUB_EVENT_NAME', '')}


def assemble_report(log, receipts, pins_digest, context):
    outcomes = validate_matrix(log)
    if set(receipts) != set(LANGUAGES):
        raise ValueError('incomplete_package_receipts')
    for kind in LANGUAGES:
        r = receipts[kind]
        if r.get('id') != kind or r.get('status') != 'PASS' or r.get('pinsSha256') != pins_digest:
            raise ValueError('invalid_package_receipt')
        if r.get('context') != context:
            raise ValueError('stale_or_cross_sha_receipt')
    return {'schema': 'truyn.five-sdk-exact-interop-evidence/v1', 'status': 'PASS',
            'scope': 'frozen-public-prerelease-vs-exact-source-need-result',
            'context': context, 'publishedSdkSourceSha': SOURCE, 'pinsSha256': pins_digest,
            'matrixLogSha256': sha(log.encode()), 'caseCount': len(outcomes), 'outcomes': outcomes,
            'packages': [receipts[k] for k in LANGUAGES],
            'stableProtocolDeclared': False, 'productionCutoverAuthorized': False,
            'limitations': ['Not a full cross-version revocation/stream lifecycle proof',
                            'Not a stable SDK publication or distributed exactly-once proof']}


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf8') as f:
        json.dump(value, f, indent=2)
        f.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    package = sub.add_parser('artifact')
    package.add_argument('kind', choices=LANGUAGES)
    package.add_argument('archive')
    package.add_argument('--output', required=True)
    report = sub.add_parser('report')
    report.add_argument('--log', required=True)
    report.add_argument('--receipts', required=True)
    report.add_argument('--output', required=True)
    args = parser.parse_args()
    pins, pins_digest = read_pins()
    context = execution_context()
    if args.command == 'artifact':
        result = verify_package(args.kind, bounded_file(args.archive), pins['packages'][args.kind])
        result.update({'context': context, 'pinsSha256': pins_digest})
    else:
        receipts = {k: loads(bounded_file(Path(args.receipts) / (k + '.json'))) for k in LANGUAGES}
        result = assemble_report(bounded_file(args.log).decode(), receipts, pins_digest, context)
    save(args.output, result)
    print(json.dumps({'status': 'PASS', 'command': args.command, 'sourceSha': context['sourceSha']}))


if __name__ == '__main__':
    main()

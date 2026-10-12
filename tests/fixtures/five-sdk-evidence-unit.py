import importlib.util
import io
import itertools
import json
from pathlib import Path
import stat
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('verifier', ROOT / 'scripts/verify-five-sdk-interop.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def archive(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as z:
        for name, data in files.items():
            z.writestr(name, data)
    return output.getvalue()


def log():
    rows = [{'language': a, 'provider': b, 'requester': c, 'status': 'PASS'}
            for a, b, c in itertools.product(v.LANGUAGES, ('legacy', 'candidate'), ('legacy', 'candidate'))]
    return '\n'.join(f"PASS {r['language']} {r['provider']} provider -> {r['requester']} requester" for r in rows) + '\n' + json.dumps({'schema': 'truyn.legacy-sdk-matrix/1', 'status': 'PASS', 'outcomes': rows})


class EvidenceTests(unittest.TestCase):
    def test_archive_identity_is_not_just_version(self):
        definition = {'mode': 'archive-sha256', 'coordinate': 'fixture', 'bytes': 4, 'sha256': v.sha(b'good')}
        self.assertEqual(v.verify_package('typescript', b'good', definition)['status'], 'PASS')
        with self.assertRaisesRegex(ValueError, 'digest_mismatch'):
            v.verify_package('typescript', b'evil', definition)

    def test_go_all_source_members_and_prefix_are_bound(self):
        definition = {'mode': 'go-proxy-source-payload', 'coordinate': 'fixture', 'zipPrefix': 'module@v1/', 'files': {'go.mod': v.sha(b'module test')}}
        self.assertEqual(v.verify_package('go', archive({'module@v1/go.mod': b'module test'}), definition)['checkedPayloadFiles'], 1)
        for files in [{'other@v1/go.mod': b'module test'}, {'module@v1/go.mod': b'changed'}, {'module@v1/go.mod': b'module test', 'module@v1/inject.go': b'evil'}]:
            with self.assertRaises(ValueError):
                v.verify_package('go', archive(files), definition)

    def test_nuget_signature_envelope_is_not_a_payload_bypass(self):
        definition = {'mode': 'nuget-signed-package-payload', 'coordinate': 'fixture', 'files': {'lib/net8.0/fixture.dll': v.sha(b'good')}, 'allowedSigningEnvelopeMembers': ['.signature.p7s']}
        files = {'lib/net8.0/fixture.dll': b'good', '.signature.p7s': b'fixture-envelope'}
        self.assertEqual(v.verify_package('dotnet', archive(files), definition)['status'], 'PASS')
        for modified in [{**files, 'lib/net8.0/fixture.dll': b'evil'}, {**files, 'lib/net8.0/injected.dll': b'evil'}, {'.signature.p7s': b'only'}]:
            with self.assertRaises(ValueError):
                v.verify_package('dotnet', archive(modified), definition)

    def test_duplicate_paths_symlinks_and_traversal_rejected(self):
        for name in ['../evil', '/absolute', 'a/../evil', 'a\\evil']:
            with self.assertRaises(ValueError):
                v.zip_payload(archive({name: b'bad'}))
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as z:
            member = zipfile.ZipInfo('link')
            member.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(member, 'target')
        with self.assertRaises(ValueError):
            v.zip_payload(data.getvalue())

    def test_matrix_exact_20_cases_required(self):
        self.assertEqual(len(v.validate_matrix(log())), 20)
        for bad in [log().replace('"status": "PASS"', '"status": "FAIL"', 1), log().replace('"typescript"', '"go"'), log().replace('PASS typescript legacy', 'PASS python legacy', 1), log()[:-5]]:
            with self.assertRaises(ValueError):
                v.validate_matrix(bad)

    def test_cross_sha_or_run_receipts_rejected(self):
        context = {'sourceSha': 'a' * 40, 'runId': 1, 'runAttempt': 1}
        receipts = {kind: {'id': kind, 'status': 'PASS', 'pinsSha256': 'pin', 'context': dict(context)} for kind in v.LANGUAGES}
        report = v.assemble_report(log(), receipts, 'pin', context)
        self.assertEqual(report['status'], 'PASS')
        self.assertFalse(report['stableProtocolDeclared'])
        self.assertFalse(report['productionCutoverAuthorized'])
        receipts['go']['context']['sourceSha'] = 'b' * 40
        with self.assertRaisesRegex(ValueError, 'cross_sha'):
            v.assemble_report(log(), receipts, 'pin', context)

    def test_exact_checkout_not_pr_merge_alias(self):
        with patch.dict(v.os.environ, {'TRUYN_EXPECTED_SOURCE_SHA': 'a' * 40}), patch.object(v.subprocess, 'check_output', return_value='b' * 40):
            with self.assertRaisesRegex(ValueError, 'exact_source_sha_mismatch'):
                v.execution_context()

    def test_duplicate_json_is_not_accepted_as_evidence(self):
        with self.assertRaisesRegex(ValueError, 'duplicate_json_key'):
            v.loads('{"status":"FAIL","status":"PASS"}')


if __name__ == '__main__':
    unittest.main()

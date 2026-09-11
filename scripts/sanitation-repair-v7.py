#!/usr/bin/env python3
from pathlib import Path

ci = Path('.github/workflows/ci.yml')
text = ci.read_text()
text = text.replace('    branches: [main]\n', '    branches:\n      - main\n', 1)
ci.write_text(text)

ci_test = Path('tests/ci-enforcement.test.js')
text = ci_test.read_text()
lines = text.splitlines()
base_hits = head_hits = 0
for i, line in enumerate(lines):
    if 'assert.match(dcoJob, /DCO_BASE_SHA:' in line:
        lines[i] = r'''  assert.match(dcoJob, /DCO_BASE_SHA: ['"]?\$\{\{ github\.event\.pull_request\.base\.sha \}\}['"]?/);'''
        base_hits += 1
    if 'assert.match(dcoJob, /DCO_HEAD_SHA:' in line:
        lines[i] = r'''  assert.match(dcoJob, /DCO_HEAD_SHA: ['"]?\$\{\{ github\.event\.pull_request\.head\.sha \}\}['"]?/);'''
        head_hits += 1
if base_hits != 1 or head_hits != 1:
    raise SystemExit(f'CI DCO exact-SHA assertion reconciliation mismatch base={base_hits} head={head_hits}')
ci_test.write_text('\n'.join(lines) + '\n')

bootstrap = Path('tests/class-d-1000-bootstrap.test.js')
text = bootstrap.read_text()
text = text.replace(
    'D-1000 Azure provisioner uses the per-node XOR bootstrap planner',
    'D-1000 Azure provisioner uses the bounded host-stratified XOR bootstrap planner',
)
text = text.replace(
    'assert.match(provisioner, /plan=per-node-xor/);',
    "assert.match(provisioner, /plan=host-stratified-xor/);\n  assert.match(provisioner, /TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=\\$\\{HOST_COUNT\\}/);",
)
bootstrap.write_text(text)

for name in (
    'tests/class-d-1000-diagnostic-sizing.test.js',
    'tests/class-d-1000-remote-manifest-heredoc.test.js',
):
    path = Path(name)
    path.write_text(path.read_text().replace('truyqn', 'truyn'))

acceptance = Path('scripts/class-d-1000-final-acceptance.sh')
text = acceptance.read_text()
old_insert = "if p.count(marker_anchor) != 1:\n    raise SystemExit(f'expected exactly one D-1000 marker helper, found={p.count(marker_anchor)}')\np = p.replace(marker_anchor, marker_anchor + failure_helpers, 1)\n"
new_insert = '''d200_failure_marker = 'd200_failure_evidence_checkpoint() {'
d200_trap_helper_marker = 'd200_err_trap() {'
d200_trap_line = """trap 'd200_err_trap "$?" "$STAGE" "$LINENO"' ERR"""
canonical_d200_failure = (
    p.count(d200_failure_marker) == 1
    and p.count(d200_trap_helper_marker) == 1
    and p.count(d200_trap_line) == 1
)
if canonical_d200_failure:
    pass
else:
    if p.count(marker_anchor) != 1:
        raise SystemExit(f'expected exactly one D-1000 marker helper, found={p.count(marker_anchor)}')
    p = p.replace(marker_anchor, marker_anchor + failure_helpers, 1)
'''
if old_insert not in text:
    raise SystemExit('D-1000 failure-helper insertion reconciliation point missing')
text = text.replace(old_insert, new_insert, 1)

old = "if p.count(trap_old) != 1:\n    raise SystemExit(f'expected exactly one D-1000 ERR trap, found={p.count(trap_old)}')\np = p.replace(trap_old, trap_new, 1)\n"
new = "if canonical_d200_failure:\n    pass\nelif p.count(trap_new) == 1:\n    pass\nelif p.count(trap_old) == 1:\n    p = p.replace(trap_old, trap_new, 1)\nelse:\n    raise SystemExit(f'expected exactly one canonical D-200, canonical D-1000, or legacy D-1000 ERR trap, legacy={p.count(trap_old)} canonical_d1000={p.count(trap_new)} canonical_d200={p.count(d200_trap_line)}')\n"
if old not in text:
    old = "if p.count(trap_new) == 1:\n    pass\nelif p.count(trap_old) == 1:\n    p = p.replace(trap_old, trap_new, 1)\nelse:\n    raise SystemExit(f'expected exactly one canonical or legacy D-1000 ERR trap, legacy={p.count(trap_old)} canonical={p.count(trap_new)}')\n"
if old not in text:
    raise SystemExit('D-1000 final-acceptance trap reconciliation point missing')
text = text.replace(old, new, 1)

legacy_checks = '''grep -Fq 'finalize_failure_evidence()' "$TMP/provision.sh"
grep -Fq 'finalize_failure_evidence "$rc" "$failed_stage" "$failed_line"' "$TMP/provision.sh"
grep -Fq 'TRUYN_CLASS_D_1000_FAIL_EVIDENCE finalized=true' "$TMP/provision.sh"
grep -Fq 'TRUYN_CONV_RATE="${conv_rate:-}"' "$TMP/provision.sh"
grep -Fq '"status": "FAIL"' "$TMP/provision.sh"
grep -Fq '"evidenceFinalizedOnFail": True' "$TMP/provision.sh"
grep -Fq '.cleanup.finalizedAfterExitTrap=$after_exit_trap' "$TMP/provision.sh"
'''
canonical_or_legacy_checks = '''if grep -Fq 'd200_failure_evidence_checkpoint() {' "$TMP/provision.sh"; then
  grep -Fq 'd200_err_trap() {' "$TMP/provision.sh"
  grep -Fq 'TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT' "$TMP/provision.sh"
  grep -Fq "'cleanup': {'confirmed': False, 'remainingResources': None, 'finalizedByExitTrap': True}" "$TMP/provision.sh"
else
  grep -Fq 'finalize_failure_evidence()' "$TMP/provision.sh"
  grep -Fq 'finalize_failure_evidence "$rc" "$failed_stage" "$failed_line"' "$TMP/provision.sh"
  grep -Fq 'TRUYN_CLASS_D_1000_FAIL_EVIDENCE finalized=true' "$TMP/provision.sh"
  grep -Fq 'TRUYN_CONV_RATE="${conv_rate:-}"' "$TMP/provision.sh"
  grep -Fq '"status": "FAIL"' "$TMP/provision.sh"
  grep -Fq '"evidenceFinalizedOnFail": True' "$TMP/provision.sh"
fi
grep -Fq '.cleanup.finalizedAfterExitTrap=$after_exit_trap' "$TMP/provision.sh"
'''
if legacy_checks not in text:
    raise SystemExit('D-1000 prepared failure-evidence validation block missing')
text = text.replace(legacy_checks, canonical_or_legacy_checks, 1)

acceptance.write_text(text)

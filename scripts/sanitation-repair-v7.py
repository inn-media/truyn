#!/usr/bin/env python3
from pathlib import Path

ci = Path('.github/workflows/ci.yml')
text = ci.read_text()
text = text.replace('    branches: [main]\n', '    branches:\n      - main\n', 1)
ci.write_text(text)

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
old = "if p.count(trap_old) != 1:\n    raise SystemExit(f'expected exactly one D-1000 ERR trap, found={p.count(trap_old)}')\np = p.replace(trap_old, trap_new, 1)\n"
new = "if p.count(trap_new) == 1:\n    pass\nelif p.count(trap_old) == 1:\n    p = p.replace(trap_old, trap_new, 1)\nelse:\n    raise SystemExit(f'expected exactly one canonical or legacy D-1000 ERR trap, legacy={p.count(trap_old)} canonical={p.count(trap_new)}')\n"
if old not in text:
    raise SystemExit('D-1000 final-acceptance trap reconciliation point missing')
acceptance.write_text(text.replace(old, new, 1))

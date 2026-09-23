#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)

# D-500 is a hard two-hour catalog. Phase evidence must survive every RED.
p = ROOT / '.github/workflows/d500-acceptance.yml'
s = p.read_text(encoding='utf-8')
s = replace_once(s, '    timeout-minutes: 420\n', '    timeout-minutes: 120\n', 'd500-outer-watchdog')
s = replace_once(
    s,
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n',
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n          TRUYN_CLASS_D_SCALE=d500 \\\n',
    'd500-scale-env',
)
s = replace_once(
    s,
    '            class-d-1000-evidence.json\n',
    '            class-d-1000-evidence.json\n            class-d-phase-events.jsonl\n',
    'd500-phase-evidence-artifact',
)
p.write_text(s, encoding='utf-8')

# B03 real bootstrap qualification uses the same outer catalog bounds:
# D-500 <=2h, D-1000 <=4h, and must prove the new parallel-node path.
p = ROOT / '.github/workflows/class-d-bootstrap-qualification.yml'
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    '    timeout-minutes: 240\n',
    "    timeout-minutes: ${{ inputs.scale == 'd500' && 120 || 240 }}\n",
    'bootstrap-outer-watchdog',
)
s = replace_once(
    s,
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n',
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n          TRUYN_CLASS_D_SCALE="$SCALE" \\\n',
    'bootstrap-scale-env',
)
s = replace_once(
    s,
    '            grep -q "TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION class=${CLASS_LABEL} .* status=PASS" "$log" && marker=true || true\n',
    '            grep -q "TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION class=${CLASS_LABEL} .* executionMode=parallel-nodes nodeConcurrency=${NODES_PER_HOST} .* status=PASS" "$log" && marker=true || true\n',
    'bootstrap-parallel-marker',
)
s = replace_once(
    s,
    '            class-d-bootstrap-qualification.json\n',
    '            class-d-bootstrap-qualification.json\n            class-d-phase-events.jsonl\n',
    'bootstrap-phase-evidence-artifact',
)
s = replace_once(
    s,
    '          echo "TRUYN_CLASS_D_BOOTSTRAP_TERMINAL scale=$CLASS_LABEL result=$result ',
    '          echo "TRUYN_CLASS_D_BOOTSTRAP_TERMINAL block=B03 architecture=parallel-fanout-global-barrier scale=$CLASS_LABEL result=$result ',
    'bootstrap-b03-terminal',
)
p.write_text(s, encoding='utf-8')

print('TRUYN_CLASS_D_WORKFLOW_CONTRACTS=GENERATED')

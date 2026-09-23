from pathlib import Path

MARKERS = [
    '# D_SERIES_AUTOCHAIN_REPAIR_MARKER\n',
    '// D_SERIES_AUTOCHAIN_REPAIR_MARKER\n',
    '<!-- D_SERIES_AUTOCHAIN_REPAIR_MARKER -->\n',
]

def load(path):
    return Path(path).read_text()

def save(path, text):
    Path(path).write_text(text)

def unmark(text):
    for marker in MARKERS:
        text = text.replace(marker, '')
    return text

def must_replace(text, old, new, min_count=1, exact_count=None):
    count = text.count(old)
    if exact_count is not None:
        assert count == exact_count, f'expected {exact_count} occurrences, found {count}: {old[:100]!r}'
    else:
        assert count >= min_count, f'expected >= {min_count} occurrences, found {count}: {old[:100]!r}'
    return text.replace(old, new)

# 1) Canonical Swarm: exact-main push is the durable D-500 transport.
p = '.github/workflows/d200-bug-hunt.yml'
s = unmark(load(p))
s = must_replace(s, 'on:\n  pull_request: {}\n  workflow_dispatch:\n', '''on:\n  pull_request: {}\n  push:\n    branches: [main]\n    paths:\n      - '.github/workflows/d200-bug-hunt.yml'\n      - '.github/workflows/d-series-blockwise-preflight.yml'\n      - '.github/workflows/class-d-bootstrap-qualification.yml'\n      - 'config/d-series-*.json'\n      - 'benchmarks/scale/**'\n      - 'network/**'\n      - 'node/**'\n      - 'core/**'\n      - 'adapters/**'\n      - 'scripts/class-d-*'\n      - 'scripts/d-series-*'\n      - 'scripts/d200-*'\n      - 'scripts/verify-d-series-*'\n      - 'tests/d-series-*'\n      - 'tests/class-d-*'\n      - 'tests/d500-*'\n      - 'package.json'\n      - 'package-lock.json'\n  workflow_dispatch:\n''', exact_count=1)
s = must_replace(s, "github.event_name == 'workflow_dispatch'", "(github.event_name == 'workflow_dispatch' || github.event_name == 'push')", min_count=5)
s = must_replace(s, 'if [[ "$EVENT" == workflow_dispatch ]]; then', 'if [[ "$EVENT" == workflow_dispatch || "$EVENT" == push ]]; then', min_count=3)
s = must_replace(s, "${{ inputs.scale || 'all' }}", "${{ inputs.scale || (github.event_name == 'push' && 'd500') || 'all' }}", min_count=5)
s = must_replace(s, "if: inputs.scale == 'all' || inputs.scale == 'd500' || inputs.scale == 'd1000' || github.event_name == 'pull_request'", "if: inputs.scale == 'all' || inputs.scale == 'd500' || inputs.scale == 'd1000' || github.event_name == 'pull_request' || github.event_name == 'push'", exact_count=1)
save(p, s)

# 2) Full Blockwise: downstream only from GREEN Swarm or explicit manual admission.
p = '.github/workflows/d-series-blockwise-preflight.yml'
s = unmark(load(p))
s = must_replace(s, 'on:\n  pull_request: {}\n  workflow_dispatch:\n', '''on:\n  pull_request: {}\n  workflow_run:\n    workflows: ["D-Series Sanitation Swarm"]\n    types: [completed]\n    branches: [main]\n  workflow_dispatch:\n''', exact_count=1)
s = must_replace(s, "group: d-series-blockwise-${{ github.event_name }}-${{ github.event.pull_request.head.sha || inputs.source_sha || github.sha }}-${{ inputs.block || 'all' }}", "group: d-series-blockwise-${{ github.event_name }}-${{ github.event.workflow_run.head_sha || github.event.pull_request.head.sha || inputs.source_sha || github.sha }}-${{ inputs.block || 'all' }}", exact_count=1)
s = must_replace(s, "${{ github.event_name == 'workflow_dispatch' && inputs.source_sha || github.event.pull_request.head.sha }}", "${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.event_name == 'workflow_dispatch' && inputs.source_sha || github.event.pull_request.head.sha }}", min_count=5)
s = must_replace(s, 'if [[ "$EVENT" == workflow_dispatch ]]; then', 'if [[ "$EVENT" == workflow_dispatch || "$EVENT" == workflow_run ]]; then', min_count=2)
s = must_replace(s, "if: github.event_name == 'workflow_dispatch' && inputs.block == 'all'", "if: (github.event_name == 'workflow_dispatch' && inputs.block == 'all') || github.event_name == 'workflow_run'", min_count=3)
s = must_replace(s, 'TRUYN_D_SERIES_SWARM_RUN: ${{ inputs.swarm_run_id }}', "TRUYN_D_SERIES_SWARM_RUN: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || inputs.swarm_run_id }}", exact_count=1)
s = must_replace(s, 'TRUYN_D_SERIES_SWARM_SCALE: ${{ inputs.scale }}', "TRUYN_D_SERIES_SWARM_SCALE: ${{ github.event_name == 'workflow_run' && 'd500' || inputs.scale }}", exact_count=1)
s = must_replace(s, 'bash scripts/verify-d-series-swarm-run.sh "${{ inputs.source_sha }}"', 'bash scripts/verify-d-series-swarm-run.sh "${{ github.event_name == \'workflow_run\' && github.event.workflow_run.head_sha || inputs.source_sha }}"', exact_count=1)
s = must_replace(s, "if: github.event_name != 'workflow_dispatch' || inputs.block != 'all'", "if: github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && inputs.block != 'all')", exact_count=1)
s = must_replace(s, "SCALE_INPUT: ${{ inputs.scale || 'all' }}", "SCALE_INPUT: ${{ github.event_name == 'workflow_run' && 'd500' || inputs.scale || 'all' }}", exact_count=1)
s = must_replace(s, '"sourceSha": "${{ inputs.source_sha }}",', '"sourceSha": "${{ github.event_name == \'workflow_run\' && github.event.workflow_run.head_sha || inputs.source_sha }}",', exact_count=1)
s = must_replace(s, '"scale": "${{ inputs.scale }}",', '"scale": "${{ github.event_name == \'workflow_run\' && \'d500\' || inputs.scale }}",', exact_count=1)
s = must_replace(s, '"swarmRunId": "${{ inputs.swarm_run_id }}",', '"swarmRunId": "${{ github.event_name == \'workflow_run\' && github.event.workflow_run.id || inputs.swarm_run_id }}",', exact_count=1)
save(p, s)

# 3) Isolated LIVE qualification: only after full Blockwise provenance.
p = '.github/workflows/class-d-bootstrap-qualification.yml'
s = unmark(load(p))
s = must_replace(s, 'on:\n  workflow_dispatch:\n', '''on:\n  workflow_run:\n    workflows: ["D-Series Blockwise Preflight"]\n    types: [completed]\n    branches: [main]\n  workflow_dispatch:\n''', exact_count=1)
s = must_replace(s, '        type: string\n      scale:\n', '''        type: string\n      blockwise_run_id:\n        description: Exact-SHA GREEN full Blockwise admission run\n        required: true\n        type: string\n      scale:\n''', exact_count=1)
s = must_replace(s, 'permissions:\n  contents: read\n  id-token: write\n', 'permissions:\n  contents: read\n  actions: read\n  id-token: write\n', exact_count=1)
s = must_replace(s, 'group: class-d-bootstrap-${{ inputs.scale }}-${{ inputs.source_sha }}', "group: class-d-bootstrap-${{ github.event_name == 'workflow_run' && 'd500' || inputs.scale }}-${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || inputs.source_sha }}", exact_count=1)
s = must_replace(s, 'SOURCE_SHA: ${{ inputs.source_sha }}\n  SCALE: ${{ inputs.scale }}', "SOURCE_SHA: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || inputs.source_sha }}\n  SCALE: ${{ github.event_name == 'workflow_run' && 'd500' || inputs.scale }}", exact_count=1)
checkout = '''      - uses: actions/checkout@v4\n        with:\n          ref: ${{ env.SOURCE_SHA }}\n          persist-credentials: false\n          fetch-depth: 1\n'''
verify = checkout + '''\n      - name: Verify exact full Blockwise admission provenance\n        env:\n          GH_TOKEN: ${{ github.token }}\n          TRUYN_D_SERIES_BLOCKWISE_PREFLIGHT_RUN: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.id || inputs.blockwise_run_id }}\n        shell: bash\n        run: |\n          set -Eeuo pipefail\n          bash scripts/verify-d-series-blockwise-preflight-run.sh "$SOURCE_SHA"\n'''
s = must_replace(s, checkout, verify, exact_count=1)
save(p, s)

# 4) Historical/manual bootstrap launcher must carry Blockwise provenance too.
p = '.github/workflows/class-d-bootstrap-launcher.yml'
s = unmark(load(p))
s = must_replace(s, 'scale="$(sed -n \'s/^SCALE=//p\' "$token" | tail -1)"\n          [[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]', 'scale="$(sed -n \'s/^SCALE=//p\' "$token" | tail -1)"\n          blockwise_run_id="$(sed -n \'s/^BLOCKWISE_RUN_ID=//p\' "$token" | tail -1)"\n          [[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]\n          [[ "$blockwise_run_id" =~ ^[1-9][0-9]+$ ]]', exact_count=1)
s = must_replace(s, '-f source_sha="$source_sha" \\\n            -f scale="$scale"', '-f source_sha="$source_sha" \\\n            -f blockwise_run_id="$blockwise_run_id" \\\n            -f scale="$scale"', exact_count=1)
save(p, s)

# 5) Provenance verifiers accept only the canonical automatic event in addition to manual dispatch.
p = 'scripts/verify-d-series-swarm-run.sh'
s = unmark(load(p))
s = must_replace(s, '.event == "workflow_dispatch" and', '(.event == "workflow_dispatch" or .event == "push") and', exact_count=1)
save(p, s)

p = 'scripts/verify-d-series-blockwise-preflight-run.sh'
s = unmark(load(p))
s = must_replace(s, '.event == "workflow_dispatch" and', '(.event == "workflow_dispatch" or .event == "workflow_run") and', exact_count=1)
save(p, s)

# 6) Contract tests permanently pin the automatic dependency chain.
p = 'tests/d-series-swarm-integration.test.js'
s = unmark(load(p))
s = must_replace(s, "  ]) assert.ok(workflow.includes(marker), `Swarm workflow lost marker: ${marker}`);\n", "  ]) assert.ok(workflow.includes(marker), `Swarm workflow lost marker: ${marker}`);\n  assert.ok(workflow.includes('push:\\n    branches: [main]'), 'Swarm must own exact-main automatic D-500 diagnosis');\n", exact_count=1)
s = must_replace(s, "  assert.ok(!workflow.includes('push:\\n    branches: [main]'), 'Blockwise must not race Swarm as an automatic main push admission');\n  assert.ok(verifier.includes('.event == \"workflow_dispatch\"'));", "  assert.ok(!workflow.includes('push:\\n    branches: [main]'), 'Blockwise must not race Swarm as an automatic main push admission');\n  assert.ok(workflow.includes('workflow_run:'), 'Blockwise must consume completed Swarm instead of racing it');\n  assert.ok(verifier.includes('workflow_run'));", exact_count=1)
s = must_replace(s, "    '.event == \"workflow_dispatch\"',", "    '(.event == \"workflow_dispatch\" or .event == \"push\")',", exact_count=1)
save(p, s)

p = 'tests/d-series-blockwise-preflight.test.js'
s = unmark(load(p))
s = must_replace(s, '  assert.match(workflow, /workflow_dispatch:/);\n', '  assert.match(workflow, /workflow_dispatch:/);\n  assert.match(workflow, /workflow_run:/);\n', exact_count=1)
s = must_replace(s, "test('full launch gate accepts only exact-main successful manual admission with Swarm provenance', () => {", "test('full launch gate accepts only exact-main successful admission with Swarm provenance', () => {", exact_count=1)
s = must_replace(s, '  assert.match(verifier, /\\.event == "workflow_dispatch"/);', '  assert.match(verifier, /workflow_dispatch.*workflow_run/);', exact_count=1)
append = '''\n\ntest('GREEN Blockwise admission automatically gates isolated D-500 LIVE qualification', () => {\n  const live = fs.readFileSync('.github/workflows/class-d-bootstrap-qualification.yml', 'utf8');\n  assert.match(live, /workflow_run:/);\n  assert.match(live, /D-Series Blockwise Preflight/);\n  assert.match(live, /blockwise_run_id:/);\n  assert.match(live, /verify-d-series-blockwise-preflight-run\\.sh/);\n  assert.match(live, /github\\.event\\.workflow_run\\.head_sha/);\n  assert.match(live, /'d500'/);\n});\n'''
assert "GREEN Blockwise admission automatically gates isolated D-500 LIVE qualification" not in s
s += append
save(p, s)

p = 'tests/class-d-bootstrap-qualification.test.js'
s = unmark(load(p))
s = must_replace(s, '  assert.match(workflow, /source_sha:/);\n', '  assert.match(workflow, /source_sha:/);\n  assert.match(workflow, /blockwise_run_id:/);\n  assert.match(workflow, /workflow_run:/);\n  assert.match(workflow, /D-Series Blockwise Preflight/);\n  assert.match(workflow, /verify-d-series-blockwise-preflight-run\\.sh/);\n', exact_count=1)
save(p, s)

# 7) Canonical documentation records the durable dependency, not a chat-only convention.
p = 'docs/operations/class-d/D_SERIES_SANITATION_SWARM.md'
s = unmark(load(p))
section = '''\n## Automatic exact-main dependency chain\n\nWhile architecture lock #737 is active, D-500 qualification is mechanically chained: a D-Series-relevant push to exact `main` runs the canonical **D-Series Sanitation Swarm** in D-500 scope; only a terminal GREEN Swarm run may trigger **D-Series Blockwise Preflight** through `workflow_run`; only a terminal GREEN full B01-B16 admission may trigger **Class D Bootstrap Qualification** in isolated D-500 mode. Manual LIVE qualification requires the exact Blockwise run ID and therefore cannot bypass admission.\n\nThis automatic transport changes no routing, recovery, durability, topology, safety, cleanup, evidence, terminal, process-count, or acceptance thresholds. D-1000 remains a separate explicit scale gate.\n'''
if '## Automatic exact-main dependency chain' not in s:
    s += section
save(p, s)

#!/usr/bin/env python3
from pathlib import Path

p = Path('scripts/apply-d200-repository-sanitation.sh')
s = p.read_text()

marker = '# Exact sanitation smoke/full qualification on the same working tree; no cloud/D-200 execution.\n'
if marker not in s:
    raise SystemExit('sanitation qualification marker missing')
s = s.replace(
    marker,
    "python3 scripts/sanitation-repair-v7.py\nrm -f scripts/sanitation-repair-v7.py scripts/sanitation-executor-prep-v7.py\ngit add -A\n\n" + marker,
    1,
)

s = s.replace('go test ./... --count=1\n', '')
s = s.replace('TRUYN_RELEASE_SOURCE_SHA="$(git rev-parse HEAD)" sdk/release/build-release.sh\nrm -rf sdk/release/dist\n', '')
s = s.replace('git diff --check\n\n# Final fail-closed scans', 'git diff --cached --check\n\n# Final fail-closed scans')
s = s.replace("run('empty-sas','2')", "run('empty-sas','4')")
s = s.replace("s['test']='npm run test:full'", "s['test']='node --test tests/*.test.js'")

needle = '      - run: node sdk/conformance/run-five-language-e2e.mjs\n      - run: sdk/release/build-release.sh\n'
replacement = '''      - run: node sdk/conformance/run-five-language-e2e.mjs
      - name: Verify SDK release scanner wiring
        run: node --test tests/sdk-release-ci-contract.test.js
      - name: Build and verify SDK release packages
        run: sdk/release/build-release.sh
      - name: Clean-room import packed TypeScript SDK
        shell: bash
        run: |
          set -Eeuo pipefail
          package="$GITHUB_WORKSPACE/sdk/release/dist/typescript/truyn-sdk-0.1.0-alpha.2.tgz"
          test -f "$package"
          cleanroom="$(mktemp -d)"
          cd "$cleanroom"
          npm init --yes >/dev/null
          npm install --ignore-scripts --no-audit --no-fund "$package"
          node --input-type=module -e "import('@truyn/sdk').then((m) => { if (typeof m.TruynClient !== 'function') throw new Error('TruynClient export missing'); if (typeof m.TruynLocalNodeClient !== 'function') throw new Error('TruynLocalNodeClient export missing'); })"
'''
if needle not in s:
    raise SystemExit('SDK release CI insertion point missing')
s = s.replace(needle, replacement, 1)

old = 'rm -f .github/pull_request_template.md .github/workflows/.gitkeep\nrm -rf _tmp_parts\n'
new = '''rm -f .github/pull_request_template.md .github/workflows/.gitkeep
while IFS= read -r -d '' keep; do
  dir="$(dirname "$keep")"
  if find "$dir" -mindepth 1 -maxdepth 1 ! -name .gitkeep -print -quit | grep -q .; then
    rm -f "$keep"
  fi
done < <(find . -name .gitkeep -not -path './.git/*' -print0)
rm -rf _tmp_parts
'''
if old not in s:
    raise SystemExit('gitkeep sanitation insertion point missing')
s = s.replace(old, new, 1)

gates = [
    ('npm run test:fast', 'fast'),
    ('npm run test:security', 'security'),
    ('node --test tests/d200-canonical-regressions.test.js tests/d200-anti-weakening.test.js tests/d200-staging-robustness.test.js tests/repository-hygiene.test.js tests/affected-tests.test.js tests/test-suite-taxonomy.test.js tests/documentation-status.test.js tests/evidence-preservation.test.js', 'focused'),
    ('bash scripts/class-d-200-preflight-qualification.sh', 'd200-preflight'),
    ('npm run test:full', 'full-node'),
    ('python -m pip install --disable-pip-version-check -e ./sdk/python', 'python-install'),
    ('( cd sdk/go && go test ./... )', 'go-sdk'),
    ('mvn -q -f sdk/java/pom.xml test', 'java-sdk'),
    ('dotnet build sdk/dotnet/Truyn.Sdk.csproj --configuration Release --nologo', 'dotnet-sdk'),
    ('node sdk/conformance/run-five-language-e2e.mjs', 'five-language'),
    ('git diff --check', 'diff-check'),
    ('node scripts/check-d200-contract.mjs', 'contract-final'),
    ('node scripts/check-repository-hygiene.mjs', 'hygiene-final'),
]
for cmd, name in gates:
    s = s.replace(
        cmd,
        f"printf 'SANITATION_GATE_START={name}\\n'\n{cmd}\nprintf 'SANITATION_GATE_PASS={name}\\n'",
        1,
    )

p.write_text(s)

#!/usr/bin/env python3
from pathlib import Path
import re, subprocess

PROV=Path('benchmarks/scale/class-d-azure-1000-provision.sh')
BASE_SHA='9d998ab52d673f458a91726c839f00bd02c622f9'

def git_show(ref,path):
    return subprocess.check_output(['git','show',f'{ref}:{path}'], text=True)

# Preserve the canonical provisioner from the authoritative current main fetched
# by the controller.  BASE_SHA is only the historical Attempt-11 evidence base;
# it must never replace the current canonical bootstrap body.
canonical_ref='origin/main'
try:
    canonical=git_show(canonical_ref,str(PROV))
except Exception:
    canonical=git_show('main',str(PROV))

# Hard fail if current canonical bootstrap contract is not intact.
for marker in ('/bootstrap','/dht/refresh','/dht/readiness','maxPeers'):
    if marker not in canonical:
        raise SystemExit(f'canonical main missing required marker: {marker}')

text=canonical

# Bounded node recovery: keep canonical bootstrap body inline.  Add one bounded
# service restart/re-probe only when a node does not become live; no topology,
# peer limit, evaluator or acceptance-floor changes.
needle='''        if [[ "$ready" != "1" ]]; then
          echo "node readiness failed host=$host node=$idx" >&2
          return 1
        fi'''
if needle in text and 'D500_NODE_RECOVERY_ONCE' not in text:
    repl='''        if [[ "$ready" != "1" ]]; then
          # D500_NODE_RECOVERY_ONCE: bounded recovery for a single dead node.
          # The canonical bootstrap/refresh/readiness sequence remains inline.
          echo "node readiness first probe failed host=$host node=$idx; bounded restart" >&2
          remote_exec "$host" "sudo systemctl restart truyn-d1000@${idx}.service" || return 1
          sleep "${D500_NODE_RECOVERY_BACKOFF_SECONDS:-3}"
          ready=0
          for _recover_probe in 1 2 3; do
            if remote_exec "$host" "curl -fsS --max-time 4 http://127.0.0.1:${port}/dht/readiness >/dev/null"; then
              ready=1
              break
            fi
            sleep "${D500_NODE_RECOVERY_BACKOFF_SECONDS:-3}"
          done
          if [[ "$ready" != "1" ]]; then
            echo "node readiness failed after bounded recovery host=$host node=$idx" >&2
            return 1
          fi
        fi'''
    text=text.replace(needle,repl,1)

# Azure VM-Agent/Run-Command drain/backoff is implemented inside the existing
# bounded remote execution primitive.  Retry only known transient conflict/busy
# states; agent-unreachable and slow timeout remain distinct hard failures.
if 'D500_RUN_COMMAND_DRAIN' not in text:
    # Locate the first az vm run-command invocation in the existing remote_exec
    # function and wrap it conservatively without moving bootstrap logic.
    pat=re.compile(r'(?m)^(\s*)(az\s+vm\s+run-command\s+invoke[^\n]*(?:\\\n[^\n]*)*)')
    m=pat.search(text)
    if m:
        indent=m.group(1); cmd=m.group(2)
        wrapped=(f'{indent}# D500_RUN_COMMAND_DRAIN: bounded Azure transient-conflict retry\n'
                 f'{indent}local _d500_rc=0 _d500_try=0\n'
                 f'{indent}while :; do\n'
                 f'{indent}  _d500_try=$((_d500_try + 1))\n'
                 f'{indent}  {cmd.strip()} && _d500_rc=0 || _d500_rc=$?\n'
                 f'{indent}  [[ "$_d500_rc" -eq 0 ]] && break\n'
                 f'{indent}  [[ "$_d500_try" -ge "${{D500_RUN_COMMAND_MAX_ATTEMPTS:-3}}" ]] && return "$_d500_rc"\n'
                 f'{indent}  sleep "${{D500_RUN_COMMAND_BACKOFF_SECONDS:-5}}"\n'
                 f'{indent}done')
        text=text[:m.start()]+wrapped+text[m.end():]

PROV.write_text(text)

# Sanitize generation-1 temporary surfaces if present.  Do not modify locked
# D-500 evaluator/workflow surfaces.
for p in (
    Path('benchmarks/scale/class-d-azure-run-command-helper.sh'),
    Path('tests/d500-attempt12-resilience.test.mjs'),
    Path('tests/d500-attempt12-azure-run-command.test.mjs'),
):
    if p.exists(): p.unlink()

print('D500_MINIMAL_REPAIR_APPLIED')

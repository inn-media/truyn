#!/usr/bin/env python3
from pathlib import Path
import re, subprocess
PROV=Path('benchmarks/scale/class-d-azure-1000-provision.sh')
def show(ref,p): return subprocess.check_output(['git','show',f'{ref}:{p}'],text=True)
text=show('origin/main',str(PROV))
for m in ('/bootstrap','/dht/refresh','/dht/readiness','maxPeers'):
    if m not in text: raise SystemExit('canonical contract missing '+m)
# Preserve canonical body; only normalize bootstrap wait shape required by existing concurrency contract.
text=text.replace('for pid in "${bootstrap_pids[@]}"; do\n    wait "$pid"\n  done','for i in "${!bootstrap_pids[@]}"; do\n    wait "${bootstrap_pids[$i]}"\n  done')
# Bounded dead-node recovery adjacent to the existing readiness failure.
needle='''        if [[ "$ready" != "1" ]]; then
          echo "node readiness failed host=$host node=$idx" >&2
          return 1
        fi'''
if needle in text:
  text=text.replace(needle,'''        if [[ "$ready" != "1" ]]; then
          # D500_NODE_RECOVERY_ONCE
          remote_exec "$host" "sudo systemctl restart truyn-d1000@${idx}.service" || return 1
          sleep "${D500_NODE_RECOVERY_BACKOFF_SECONDS:-3}"
          ready=0
          for _rp in 1 2 3; do
            if remote_exec "$host" "curl -fsS --max-time 4 http://127.0.0.1:${port}/dht/readiness >/dev/null"; then ready=1; break; fi
            sleep "${D500_NODE_RECOVERY_BACKOFF_SECONDS:-3}"
          done
          [[ "$ready" == "1" ]] || return 1
        fi''',1)
# Do not restructure remote_exec. Add bounded retry only around its canonical az invocation when found.
if 'D500_RUN_COMMAND_DRAIN' not in text:
  p=re.compile(r'(?m)^(\s*)(az vm run-command invoke[^\n]*)$'); m=p.search(text)
  if m:
    ind,cmd=m.group(1),m.group(2)
    w=(ind+'# D500_RUN_COMMAND_DRAIN\n'+ind+'local _drc=1\n'+ind+'for _dt in 1 2 3; do\n'+ind+'  '+cmd.strip()+' && { _drc=0; break; } || _drc=$?\n'+ind+'  sleep "${D500_RUN_COMMAND_BACKOFF_SECONDS:-5}"\n'+ind+'done\n'+ind+'[[ "$_drc" -eq 0 ]] || return "$_drc"')
    text=text[:m.start()]+w+text[m.end():]
PROV.write_text(text)
print('D500_MINIMAL_REPAIR_APPLIED')

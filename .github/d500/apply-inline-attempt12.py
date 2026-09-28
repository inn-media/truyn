#!/usr/bin/env python3
from pathlib import Path
import subprocess
p=Path('benchmarks/scale/class-d-azure-1000-provision.sh')
s=p.read_text()
# origin/main is fetched by the controller immediately before BASE_SHA is
# checked out. Use that immutable remote-tracking snapshot as the canonical
# bootstrap contract source; after `git reset --hard BASE_SHA`, HEAD is the
# historical repair base and must not be mistaken for current main.
base=subprocess.check_output(['git','show','origin/main:benchmarks/scale/class-d-azure-1000-provision.sh'],text=True)
def stage(x):
    a=x.index('STAGE=bootstrap\n')
    b=x.index('\nif [[ "${TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION_ONLY:-0}" == 1 ]]',a)
    return a,b,x[a:b]
a,b,_=stage(s); _,_,bs=stage(base)
old="  curl -fsS --max-time 90 -H 'content-type: application/json' --data-binary \"\\$payload\" \"\\${control_url}/bootstrap\" >/dev/null"
new="""  bootstrap_rc=1
  for node_attempt in 1 2 3; do
    if curl -fsS --max-time 90 -H 'content-type: application/json' --data-binary \"\\$payload\" \"\\${control_url}/bootstrap\" >/dev/null; then bootstrap_rc=0; break; fi
    echo \"TRUYN_D500_BOOTSTRAP_NODE_RECOVERY host=${i} node=\\$j phase=bootstrap attempt=\\$node_attempt\" >&2
    systemctl restart \"truyn-d1000@\\$j.service\" || true
    sleep \\$((node_attempt * 2))
  done
  [[ \"\\$bootstrap_rc\" -eq 0 ]]"""
if bs.count(old)!=1: raise SystemExit('bootstrap preimage mismatch')
bs=bs.replace(old,new,1)
old='  readiness=\\$(curl -fsS --max-time 20 "\\${control_url}/dht/readiness")'
new="""  readiness=''
  readiness_rc=1
  for node_attempt in 1 2 3; do
    if readiness=\\$(curl -fsS --max-time 20 \"\\${control_url}/dht/readiness\"); then readiness_rc=0; break; fi
    echo \"TRUYN_D500_BOOTSTRAP_NODE_RECOVERY host=${i} node=\\$j phase=readiness attempt=\\$node_attempt\" >&2
    systemctl restart \"truyn-d1000@\\$j.service\" || true
    sleep \\$((node_attempt * 2))
  done
  [[ \"\\$readiness_rc\" -eq 0 ]]"""
if bs.count(old)!=1: raise SystemExit('readiness preimage mismatch')
bs=bs.replace(old,new,1)
s=s[:a]+bs+s[b:]
p.write_text(s)
Path('scripts/class-d-bootstrap-host-resilience.sh').unlink(missing_ok=True)
Path('tests/d500-bootstrap-resilience.test.js').unlink(missing_ok=True)

from pathlib import Path

contract_path = Path('tests/d200-recovery-control-plane.test.js')
c = contract_path.read_text()
old_contract = "  assert.match(runtime, /await this\\.discovery\\.refreshRoutingTable\\(\\{/);"
new_contract = "  assert.match(runtime, /await this\\.rpc\\.withDeadline\\(Date\\.now\\(\\) \\+ 1_500, \\(\\) => this\\.discovery\\.refreshRoutingTable\\(\\{/);"
if c.count(old_contract) != 1:
    raise SystemExit(f'stale recovery-epoch refresh assertion: expected one match, got {c.count(old_contract)}')
c = c.replace(old_contract, new_contract, 1)
contract_path.write_text(c)

restart_path = Path('tests/peer-record-restart-propagation-readiness.test.js')
t = restart_path.read_text()
old_pending = """    const pending = restarted.peerRecordLifecycleSnapshot().propagation;
    assert.deepEqual(pending.pendingNodeIds, [flaky.nodeId]);
    assert.ok(pending.acknowledgedNodeIds.includes(stable.nodeId));
"""
new_pending = """    const recovering = restarted.peerRecordLifecycleSnapshot();
    assert.equal(recovering.recoveryEpoch.active, true, 'network recovery epoch remains active after process startup');
    assert.notEqual(recovering.recoveryEpoch.phase, 'ready', 'network readiness must remain fail-closed while recovery is asynchronous');
"""
if t.count(old_pending) != 1:
    raise SystemExit(f'stale synchronous pending assertion: expected one match, got {t.count(old_pending)}')
t = t.replace(old_pending, new_pending, 1)
restart_path.write_text(t)

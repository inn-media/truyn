import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [mode, role, relayUrl, capability] = process.argv.slice(2);
if (!['legacy','candidate'].includes(mode) || !['provider','requester'].includes(role) || !relayUrl || !capability)
  throw new Error('Usage: role.ts legacy|candidate provider|requester <relayUrl> <capability>');

const clientModule = mode === 'legacy'
  ? await import(resolve(process.env.TRUYN_LEGACY_NPM_ROOT!, 'node_modules/@truyn/sdk/dist/index.js'))
  : await import('../..' + '/typescript/src/local-node.ts');
const Client = mode === 'legacy' ? clientModule.TruynLocalNodeClient : clientModule.TruynLocalNodeClient;
if (!Client) throw new Error('TruynLocalNodeClient missing in ' + mode);
const peer = await Client.connect({relayUrl, name: 'legacy-matrix-ts-'+mode+'-'+role});
try {
  if (role === 'provider') {
    await peer.offer(capability, {mode});
    process.stdout.write('READY\n');
    const need = await peer.nextNeed({timeoutMs: 15000});
    if (need.capability !== capability) throw new Error('NEED capability mismatch');
    await peer.result(need.needId, {ok:true, producedBy:mode});
    process.stdout.write('PASS provider\n');
  } else {
    const receipt = await peer.need(capability, {payload:'legacy-new-wire'});
    const result = await peer.waitForResult(receipt.needId, {timeoutMs:15000});
    if (!result?.verification?.ok || result?.provider === undefined) throw new Error('RESULT signature/correlation invalid');
    process.stdout.write('PASS requester\n');
  }
} finally { peer.close(); }

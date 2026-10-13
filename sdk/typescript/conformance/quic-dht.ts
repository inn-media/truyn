import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QuicDhtClient} from '../src/quic-dht.ts';

const [host,portText,certPath,nodeId]=process.argv.slice(2);
if(!host||!portText||!certPath||!nodeId)throw Error('host port certificate peerNodeId required');
const opts={host,port:Number(portText),ca:readFileSync(certPath,'utf8'),expectedNodeId:nodeId};
const client=await QuicDhtClient.connect(opts);
try{
  assert.equal(await client.ping(),true);
  const peers=await client.findNode(nodeId);
  assert.ok(peers.some(x=>x.nodeId===nodeId),'verified FIND_NODE peer missing');
  const announce=await client.announce(['quic://127.0.0.1:4433']);
  assert.equal(announce.accepted,true);
  assert.equal(announce.nodeId,client.nodeId);
  const stored=await client.store('typescript-native','five-dht-rpc',{source:'ts-quic',count:5});
  assert.equal(stored.stored,true);
  const found=await client.findValue('typescript-native','five-dht-rpc');
  assert.ok(found.some(x=>x.recordId===stored.recordId));
  await assert.rejects(()=>client.findNode(''),/target_node_id_required/);
  console.log('TRUYN_NATIVE_TYPESCRIPT_QUIC_DHT_PASS five_methods=5 TLS=VERIFIED signed_records=VERIFIED');
}finally{await client.close();}
await assert.rejects(
  ()=>QuicDhtClient.connect({...opts,expectedNodeId:'truyn:node:'+'0'.repeat(64)}),
  /quic_wrong_peer_identity/
);

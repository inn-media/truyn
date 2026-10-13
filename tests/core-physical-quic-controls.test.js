import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {TruynNetworkNode} from '../network/runtime.js';

// Real ephemeral QUIC/UDP sockets and five production RPC methods.
// This proves the JS network runtime only, never five native SDK QUIC support.
test('all five A-I QUIC control methods execute with signed records and fail-closed negatives', {timeout:60000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'truyn-five-quic-controls-'));
 const keyfile=join(dir,'key.pem'),certfile=join(dir,'cert.pem');
 const openssl=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyfile,
   '-out',certfile,'-subj','/CN=127.0.0.1','-days','1',
   '-addext','subjectAltName=IP:127.0.0.1'],{encoding:'utf8'});
 assert.equal(openssl.status,0,openssl.stderr);
 const tls={key:await readFile(keyfile,'utf8'),cert:await readFile(certfile,'utf8')};
 const a=new TruynNetworkNode({host:'127.0.0.1',tls});
 const b=new TruynNetworkNode({host:'127.0.0.1',tls});
 const c=new TruynNetworkNode({host:'127.0.0.1',tls});
 try {
   const [recordA,recordB,recordC]=await Promise.all([a.start(),b.start(),c.start()]);
   assert.ok(recordA.nodeId&&recordB.nodeId&&recordC.nodeId);
   a.bootstrap([recordB]); b.bootstrap([recordC]);
   // PING 21000000: authenticated QUIC control
   assert.equal(await a.rpc.ping(recordB),true,'PING must receive authenticated pong');
   // FIND_NODE 22000000: server returns verified peer records, not an untrusted hint as authority
   const nodes=await a.rpc.findNode(recordB,c.identity.nodeId);
   assert.ok(nodes.records.some(p=>p.nodeId===c.identity.nodeId),'FIND_NODE missing target peer');
   // ANNOUNCE 23000000: a fresh signed record bound to the sender identity
   const fresh=(await a.renewPeerRecord({announce:false})).record;
   const announced=await a.rpc.announce(recordB,fresh);
   assert.equal(announced.accepted,true);
   assert.equal(announced.nodeId,a.identity.nodeId);
   // STORE 24000000 and FIND_VALUE 25000000: immutable signed content and exact ID
   const value=a.createRecord('core-qualification','five-methods',{proof:'transport-native'});
   const stored=await a.rpc.store(recordB,value);
   assert.equal(stored.stored,true);
   const found=await a.rpc.findValue(recordB,'core-qualification','five-methods');
   assert.ok(found.records.some(item=>item.recordId===value.recordId));
   // Altering signed peer or value data must be refused before acceptance.
   await assert.rejects(()=>a.rpc.announce(recordB,{...fresh,nodeId:c.identity.nodeId}),
     /invalid_peer_record|identity|signature/i);
   await assert.rejects(()=>a.rpc.store(recordB,{...value,recordId:'tampered'}),
     /invalid DHT record|signature|record/i);
 } finally {
   await Promise.allSettled([a.close(),b.close(),c.close()]);
   await rm(dir,{recursive:true,force:true});
 }
});

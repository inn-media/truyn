#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const dir=mkdtempSync(join(tmpdir(),'truyn-sdk-python-quic-'));
let server;
try{
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
 const p=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,
   '-out',cert,'-subj','/CN=127.0.0.1','-days','1','-addext','subjectAltName=IP:127.0.0.1'],
   {encoding:'utf8',timeout:20000});
 if(p.status!==0)throw Error('openssl_python_quic_fixture:'+p.stderr);
 server=new TruynNetworkNode({host:'127.0.0.1',tls:{key:readFileSync(key,'utf8'),
   cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const rec=await server.start();
 const target=new URL(rec.endpoints.find(e=>e.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
   const child=spawn('python',['sdk/python/tests/quic_dht_conformance.py',
     target.hostname,target.port,cert,rec.nodeId],{stdio:'inherit',env:process.env});
   const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('python_native_quic_timeout'));},60000);
   child.once('error',e=>{clearTimeout(timeout);reject(e)});
   child.once('exit',(code,signal)=>{clearTimeout(timeout);code===0?resolve():reject(Error('python_native_quic_failed:'+code+':'+signal))});
 });
 console.log('PASS native Python QUIC real 5 DHT RPCs and TLS/identity/security negatives');
}finally{
 await server?.close();
 rmSync(dir,{recursive:true,force:true});
}

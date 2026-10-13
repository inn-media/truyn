#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const folder=mkdtempSync(join(tmpdir(),'truyn-ts-quic-'));
let node;
try{
 const key=join(folder,'key.pem'),cert=join(folder,'cert.pem');
 const p=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,
 '-out',cert,'-subj','/CN=127.0.0.1','-days','1','-addext','subjectAltName=IP:127.0.0.1'],
 {encoding:'utf8',timeout:20000});
 if(p.status!==0)throw Error('openssl_ts_quic_fixture_failure:'+p.stderr);
 node=new TruynNetworkNode({host:'127.0.0.1',tls:{key:readFileSync(key,'utf8'),
   cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const record=await node.start();
 const uri=new URL(record.endpoints.find(x=>x.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types',
      'sdk/typescript/conformance/quic-dht.ts',uri.hostname,uri.port,cert,record.nodeId],
      {stdio:'inherit',env:process.env});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native_typescript_quic_timeout'));},60000);
   child.once('error',err=>{clearTimeout(timer);reject(err)});
   child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('native_typescript_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS TypeScript SDK native QUIC five DHT control methods');
}finally{await node?.close();rmSync(folder,{recursive:true,force:true});}

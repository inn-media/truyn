#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const dir=mkdtempSync(join(tmpdir(),'truyn-go-quic-'));
let node;
try{
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
 const p=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,
   '-subj','/CN=127.0.0.1','-days','1','-addext','subjectAltName=IP:127.0.0.1'],
   {encoding:'utf8',timeout:20000});
 if(p.status!==0)throw Error('openssl_go_quic_fixture:'+p.stderr);
 node=new TruynNetworkNode({host:'127.0.0.1',tls:{key:readFileSync(key,'utf8'),cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const record=await node.start();const uri=new URL(record.endpoints.find(e=>e.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
   const child=spawn('go',['test','-count=1','-run','^TestNativeQuicDHTConformance$','-v','./...'],
     {cwd:'sdk/go',stdio:'inherit',env:{...process.env,
       TRUYN_NATIVE_QUIC_HOST:uri.hostname,TRUYN_NATIVE_QUIC_PORT:uri.port,
       TRUYN_NATIVE_QUIC_CA:cert,TRUYN_NATIVE_QUIC_PEER:record.nodeId}});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('go_native_quic_timeout'));},90000);
   child.once('error',e=>{clearTimeout(timer);reject(e)});
   child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('go_native_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS Go native quic-go five DHT controls');
}finally{await node?.close();rmSync(dir,{recursive:true,force:true});}

#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const dir=mkdtempSync(join(tmpdir(),'truyn-java-quic-'));
let node;
try{
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
 const p=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,
 '-subj','/CN=127.0.0.1','-days','1','-addext','subjectAltName=IP:127.0.0.1'],
 {encoding:'utf8',timeout:20000});
 if(p.status!==0)throw Error('openssl_java_quic_fixture:'+p.stderr);
 const m=spawnSync('mvn',['-q','-f','sdk/java/pom.xml','dependency:build-classpath',
  '-Dmdep.outputFile=target/native-quic-dependencies.txt'],{encoding:'utf8',timeout:50000});
 if(m.status!==0)throw Error('maven_native_quic_dependency_resolution:'+m.stderr);
 const classpath='sdk/java/target/classes'+delimiter+'sdk/java/target/test-classes'+delimiter+
   readFileSync('sdk/java/target/native-quic-dependencies.txt','utf8').trim();
 node=new TruynNetworkNode({host:'127.0.0.1',tls:{key:readFileSync(key,'utf8'),
 cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const rec=await node.start();const u=new URL(rec.endpoints.find(x=>x.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
  const child=spawn('java',['-cp',classpath,'org.truyn.sdk.QuicDhtConformanceMain',
   u.hostname,u.port,cert,rec.nodeId],{stdio:'inherit',env:process.env});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native_java_quic_timeout'));},60000);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('java_native_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS native Java QUIC five DHT methods');
}finally{await node?.close();rmSync(dir,{recursive:true,force:true});}

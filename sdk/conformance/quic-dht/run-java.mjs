#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const dir=mkdtempSync(join(tmpdir(),'truyn-java-quic-'));
let node;
try{
 const key=join(dir,'key.pem'),cert=join(dir,'cert.pem'),
     caKey=join(dir,'ca.key'),ca=join(dir,'ca.pem'),csr=join(dir,'leaf.csr'),
     ext=join(dir,'server-ext.cnf');
 const makeCA=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',ca,
   '-subj','/CN=TRUYN Java Test CA','-days','1',
   '-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'],
   {encoding:'utf8',timeout:20000});
 if(makeCA.status!==0)throw Error('openssl_java_ca_failed:'+makeCA.stderr);
 const req=spawnSync('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,
   '-subj','/CN=localhost'],{encoding:'utf8',timeout:20000});
 if(req.status!==0)throw Error('openssl_java_csr_failed:'+req.stderr);
 const {writeFileSync}=await import('node:fs');
 writeFileSync(ext,'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
 const signed=spawnSync('openssl',['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,
   '-CAcreateserial','-out',cert,'-days','1','-extfile',ext],{encoding:'utf8',timeout:20000});
 if(signed.status!==0)throw Error('openssl_java_cert_failed:'+signed.stderr);
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
   u.hostname,u.port,ca,rec.nodeId],{stdio:'inherit',env:process.env});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native_java_quic_timeout'));},60000);
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('java_native_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS native Java QUIC five DHT methods');
}finally{await node?.close();rmSync(dir,{recursive:true,force:true});}

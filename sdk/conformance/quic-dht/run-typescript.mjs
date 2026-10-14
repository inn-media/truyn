#!/usr/bin/env node
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TruynNetworkNode} from '../../../network/runtime.js';
const folder=mkdtempSync(join(tmpdir(),'truyn-ts-quic-'));
let node;
try{
 const key=join(folder,'key.pem'),cert=join(folder,'cert.pem'),
       caKey=join(folder,'ca.key'),ca=join(folder,'ca.pem'),csr=join(folder,'server.csr'),
       ext=join(folder,'leaf.ext');
 const certCA=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
   '-keyout',caKey,'-out',ca,'-subj','/CN=TRUYN Local Test CA','-days','1',
   '-addext','basicConstraints=critical,CA:TRUE',
   '-addext','keyUsage=critical,keyCertSign,cRLSign'],{encoding:'utf8',timeout:20000});
 if(certCA.status!==0)throw Error('openssl_ts_ca_failure:'+certCA.stderr);
 const request=spawnSync('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,
   '-subj','/CN=localhost'],{encoding:'utf8',timeout:20000});
 if(request.status!==0)throw Error('openssl_ts_csr_failure:'+request.stderr);
 const {writeFileSync}=await import('node:fs');
 writeFileSync(ext,'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n');
 const signed=spawnSync('openssl',['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,
   '-CAcreateserial','-out',cert,'-days','1','-extfile',ext],{encoding:'utf8',timeout:20000});
 if(signed.status!==0)throw Error('openssl_ts_signed_cert_failure:'+signed.stderr);
 node=new TruynNetworkNode({host:'127.0.0.1',tls:{key:readFileSync(key,'utf8'),
   cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const record=await node.start();
 const uri=new URL(record.endpoints.find(x=>x.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types',
      'sdk/typescript/conformance/quic-dht.ts',uri.hostname,uri.port,ca,record.nodeId],
      {stdio:'inherit',env:process.env});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native_typescript_quic_timeout'));},60000);
   child.once('error',err=>{clearTimeout(timer);reject(err)});
   child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('native_typescript_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS TypeScript SDK native QUIC five DHT control methods');
}finally{await node?.close();rmSync(folder,{recursive:true,force:true});}

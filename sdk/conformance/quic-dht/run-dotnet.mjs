#!/usr/bin/env node
// Real live TRUYN QUIC/UDP server; actual first-party .NET QuicConnection client.
// Do not count this as Go/Python/Java/TypeScript qualification.
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {TruynNetworkNode} from '../../../network/runtime.js';

const folder=mkdtempSync(join(tmpdir(),'truyn-sdk-dotnet-quic-'));
let node;
try{
 const key=join(folder,'key.pem'),cert=join(folder,'cert.pem'),certDer=join(folder,'cert.der');
 const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,
   '-out',cert,'-subj','/CN=127.0.0.1','-days','1',
   '-addext','subjectAltName=IP:127.0.0.1'],{encoding:'utf8',timeout:20000});
 if(generated.status!==0)throw Error('openssl_quic_fixture_failure:'+generated.stderr);
 const der=spawnSync('openssl',['x509','-in',cert,'-outform','DER','-out',certDer],{encoding:'utf8'});
 if(der.status!==0)throw Error('openssl_cert_conversion_failed:'+der.stderr);
 node=new TruynNetworkNode({host:'127.0.0.1',tls:{
   key:readFileSync(key,'utf8'),cert:readFileSync(cert,'utf8')},peerRecordAutoRenew:false});
 const record=await node.start();
 const endpoint=new URL(record.endpoints.find(e=>e.startsWith('quic://')));
 await new Promise((resolve,reject)=>{
   const child=spawn('dotnet',['run','--no-restore','--configuration','Release','--project',
       'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj','--',
       '--quic-dht',endpoint.hostname,endpoint.port,certDer,record.nodeId],
       {stdio:'inherit',env:process.env});
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native_dotnet_quic_timeout'));},60000);
   child.once('error',err=>{clearTimeout(timer);reject(err)});
   child.once('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error('native_dotnet_quic_failure:'+code+':'+signal))});
 });
 console.log('PASS native .NET QUIC five DHT control methods with TLS pin, signed peer and signed DHT record');
}finally{
 await node?.close();
 rmSync(folder,{recursive:true,force:true});
}

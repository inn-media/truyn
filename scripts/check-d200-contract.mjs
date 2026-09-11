#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const SAFETY_FLOOR = Object.freeze({hostsRequired:20,processTarget:200,nodesPerHost:10,maxPeers:32,routingAcceptanceMinimum:0.99,convergenceMaximumMs:120000,recoveryMaximumMs:120000,acknowledgedWritesRequired:100,acknowledgedWriteLossAllowed:0,safetyViolationsAllowed:0,cleanupRemainingAllowed:0,stagingCleanupRemainingAllowed:0,peerRecordTtlMs:1800000,bootstrapMinPeerLeaseRemainingMs:900000});
export function validate(c){
  const e=[]; const f=SAFETY_FLOOR;
  if(c.schema!=='truyn.d200.contract.v1')e.push('schema');
  for(const k of ['hostsRequired','processTarget','nodesPerHost','acknowledgedWritesRequired','peerRecordTtlMs','bootstrapMinPeerLeaseRemainingMs']) if(c[k]<f[k])e.push(k);
  for(const k of ['maxPeers','convergenceMaximumMs','recoveryMaximumMs','acknowledgedWriteLossAllowed','safetyViolationsAllowed','cleanupRemainingAllowed','stagingCleanupRemainingAllowed']) if(c[k]>f[k])e.push(k);
  if(c.routingAcceptanceMinimum<f.routingAcceptanceMinimum)e.push('routingAcceptanceMinimum');
  if(c.allToAllForbidden!==true)e.push('allToAllForbidden');
  if(c.processTarget!==c.hostsRequired*c.nodesPerHost)e.push('topologyProduct');
  if(e.length) throw new Error(`D-200 safety floor violation: ${[...new Set(e)].join(',')}`);
  return true;
}
export function main(argv=process.argv.slice(2)){const p=argv[0]||'config/d200-contract.json';validate(JSON.parse(fs.readFileSync(p,'utf8')));console.log('TRUYN_D200_CONTRACT=PASS');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}

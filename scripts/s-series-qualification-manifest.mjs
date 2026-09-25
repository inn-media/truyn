#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const policyPath = 'config/s-series-frozen-candidate-policy.json';
const fail = (reason, detail='') => { console.error(`TRUYN_S_SERIES_MANIFEST=FAIL reason=${reason}${detail ? ` detail=${detail}` : ''}`); process.exit(1); };
const arg = (name, required=false) => { const i=process.argv.indexOf(name); const v=i>=0?process.argv[i+1]:''; if(required&&!v) fail(`missing_${name.slice(2).replaceAll('-','_')}`); return v; };
const git = (args, allow=false) => { const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}); if(!allow&&r.status!==0) fail('git_command_failed',`${args.join(' ')}:${(r.stderr||'').trim()}`); return r; };
const exactSha = ref => { const v=git(['rev-parse',`${ref}^{commit}`]).stdout.trim(); if(!/^[0-9a-f]{40}$/.test(v)) fail('invalid_sha',ref); return v; };
const treeSha = ref => git(['rev-parse',`${ref}^{tree}`]).stdout.trim();
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const readJson = p => { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { fail('invalid_json',p); } };
const changed = (a,b) => git(['diff','--name-only',`${a}..${b}`]).stdout.split('\n').map(x=>x.trim()).filter(Boolean).sort();
const matches = (p,prefixes) => prefixes.some(x=>p===x||p.startsWith(x));
const fingerprint = (ref,prefixes) => {
  const rows=[];
  for(const p of [...new Set(prefixes)].sort()) {
    const r=git(['ls-tree','-r','--full-tree',ref,'--',p],true);
    rows.push(`${p}\n${r.status===0?r.stdout.trim():''}`);
  }
  return digest(rows.join('\n'));
};

if(!fs.existsSync(policyPath)) fail('policy_missing');
const policyRaw=fs.readFileSync(policyPath,'utf8');
const policy=readJson(policyPath);
if(policy.schema!=='truyn.s-series.frozen-candidate-policy.v1'||policy.state!=='LOCKED') fail('policy_not_locked');
const mode=process.argv[2];
if(!['qualification','admission'].includes(mode)) fail('invalid_mode');
const output=arg('--output',true);

if(mode==='qualification') {
  const baseSha=exactSha(arg('--base-sha',true));
  const candidateSha=exactSha(arg('--candidate-sha',true));
  if(git(['merge-base','--is-ancestor',baseSha,candidateSha],true).status!==0) fail('base_not_ancestor');
  const surfaces=Object.fromEntries(policy.surfaces.map(s=>[s.id,{fingerprint:fingerprint(candidateSha,s.prefixes),blocks:s.blocks,liveRerunRequired:s.liveRerunRequired}]));
  const manifest={schema:'truyn.s-series.qualification-manifest/v1',model:policy.model,policyDigest:`sha256:${digest(policyRaw)}`,baseSha,candidateSha,candidateTreeSha:treeSha(candidateSha),candidateChangedFiles:changed(baseSha,candidateSha),surfaces,decision:{expensiveEvidenceBoundToCandidate:true,mainMovementInvalidatesCandidate:false,finalAdmissionGateRequired:true}};
  fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
  console.log(`TRUYN_S_SERIES_MANIFEST=PASS mode=qualification candidate=${candidateSha}`);
  process.exit(0);
}

const q=readJson(arg('--qualification-manifest',true));
if(q.schema!=='truyn.s-series.qualification-manifest/v1') fail('qualification_schema');
if(q.policyDigest!==`sha256:${digest(policyRaw)}`) fail('policy_digest_mismatch');
const currentMainSha=exactSha(arg('--current-main-sha',true));
const integrationRef=arg('--integration-ref',true);
const drift=changed(q.baseSha,currentMainSha);
const targeted=new Set();
let live=false;
const surfaces={};
for(const s of policy.surfaces) {
  const mainChangedFiles=drift.filter(f=>matches(f,s.prefixes));
  const candidateFingerprint=q.surfaces?.[s.id]?.fingerprint;
  if(!candidateFingerprint) fail('qualification_surface_missing',s.id);
  const integrationFingerprint=fingerprint(integrationRef,s.prefixes);
  const fingerprintChanged=candidateFingerprint!==integrationFingerprint;
  if(mainChangedFiles.length) { for(const b of s.blocks) targeted.add(b); if(s.liveRerunRequired) live=true; }
  surfaces[s.id]={mainChangedFiles,candidateFingerprint,integrationFingerprint,fingerprintChanged,blocks:s.blocks,liveRerunRequired:s.liveRerunRequired};
}
const targetedBlocks=[...targeted].sort();
const manifest={schema:'truyn.s-series.admission-manifest/v1',model:policy.model,policyDigest:q.policyDigest,baseSha:q.baseSha,candidateSha:q.candidateSha,currentMainSha,integrationTreeSha:treeSha(integrationRef),baseToCurrentMainChangedFiles:drift,surfaces,decision:{sSensitiveDrift:targetedBlocks.length>0,targetedBlocks,reuseFrozenCandidateEvidence:true,automaticFullRerun:false,liveRerunRequired:live,finalAdmissionGateRequired:true,status:live?'TARGETED_LIVE_PROOF_REQUIRED':(targetedBlocks.length?'TARGETED_REQUALIFICATION':'COMPATIBLE_NO_S_DRIFT')}};
fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
console.log(`TRUYN_S_SERIES_MANIFEST=PASS mode=admission targeted=${targetedBlocks.join(',')||'none'} live=${live}`);

#!/usr/bin/env node
// Read-only, fail-closed repository reachability and exact-content duplicate audit.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const files=execFileSync('git',['ls-files','-z'],{maxBuffer:32*1024*1024}).toString().split('\0').filter(Boolean);
const index=new Set(files);
const refs=new Map(), hashes=new Map(), deps=[];
const textFiles=files.filter(p=>/\.(?:md|js|mjs|cjs|ts|tsx|jsx|json|yml|yaml|sh|py|go|html|css|xml|toml)$/.test(p));
for(const f of files){
  const buf=readFileSync(f);
  const digest=createHash('sha256').update(buf).digest('hex');
  if(!hashes.has(digest))hashes.set(digest,[]);
  hashes.get(digest).push(f);
  refs.set(f,new Set());
}
for(const f of textFiles){
  const source=readFileSync(f,'utf8');
  if(source.length>3e6)continue;
  // Capture explicit paths, including quoted imports, workflow uses, paths filters and docs links.
  const tokens=[...source.matchAll(/(?:\.{1,2}\/|[a-zA-Z0-9_.-]+\/)[a-zA-Z0-9_.@/-]+(?:\.[a-zA-Z0-9]+)?/g)].map(m=>m[0]);
  for(const token of tokens){
    const clean=token.replace(/[)\]>'",;:]+$/g,'').split('#')[0].split('?')[0];
    const probes=[clean,path.posix.normalize(path.posix.join(path.posix.dirname(f),clean))];
    const from=path.posix.dirname(f);
    if(clean.startsWith('./')||clean.startsWith('../'))probes.push(path.posix.normalize(path.posix.join(from,clean)));
    for(const probe of probes){
      for(const ext of ['', '.js','.mjs','.ts','.json','/index.js']){
        const target=probe+ext;
        if(target!==f&&index.has(target)){refs.get(target).add(f);deps.push([f,target]);}
      }
    }
  }
}
const duplicates=[...hashes.entries()].filter(([,v])=>v.length>1).map(([hash,paths])=>({hash,paths}));
const protectedPath=p=>p.startsWith('.github/')||p.startsWith('tests/')||p.startsWith('test/')||p.startsWith('spec/')||p.startsWith('sdk/')||p.startsWith('docs/benchmarks/')||/(LICENSE|NOTICE|CHANGELOG|README|ROADMAP|package.json|package-lock.json|\.ya?ml)$/.test(p);
const candidates=files.filter(f=>refs.get(f).size===0&&!protectedPath(f)&&/\.(js|mjs|cjs|ts|py|sh)$/.test(f)).map(f=>({path:f,reason:'No statically resolved inbound reference; dynamic imports/workflow shells may still use this file',deletionAuthorized:false}));
const report={schema:'truyn.dependency-reachability/v1',files:files.length,scannedText:textFiles.length,staticEdges:deps.length,identicalContentGroups:duplicates,unreferencedCandidates:candidates,authorizedDeletions:[],limitations:['Regex-based static reference search does not prove runtime deadness','Dynamic loader, external consumers, release artifacts, package exports and workflow dispatch require separate proof','License/notice and immutable evidence copies are intentionally preserved']};
console.log('DEPENDENCY_AUDIT='+JSON.stringify(report));

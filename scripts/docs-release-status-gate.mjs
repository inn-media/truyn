#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const expected={
npm:'@truyn/sdk@0.1.0-alpha.5',pypi:'truyn-sdk==0.1.0a2',
go:'github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2',
maven:'org.truyn:truyn-sdk:0.1.0-alpha.2',nuget:'Truyn.Sdk@0.1.0-alpha.2'};
const current={
'README.md':['@truyn/sdk@0.1.0-alpha.5'],
'ROADMAP.md':['@truyn/sdk@0.1.0-alpha.5'],
'sdk/README.md':['@truyn/sdk@0.1.0-alpha.5'],
'sdk/python/README.md':[expected.pypi],
'sdk/go/README.md':[expected.go],
'sdk/java/README.md':[expected.maven],
'sdk/dotnet/README.md':['Truyn.Sdk 0.1.0-alpha.2'],
'docs/getting-started/SDK_QUICKSTART.md':[expected.npm],
'docs/compatibility/README.md':[expected.pypi],
'docs/compatibility/SDK_COMPATIBILITY.md':[expected.npm],
'docs/compatibility/SDK_PACKAGING.md':[expected.npm],
'docs/architecture/IMPLEMENTATION_STATUS.md':[expected.npm],
'docs/architecture/SDK_DEVELOPER_EXPERIENCE.md':[expected.npm],
'spec/compatibility/matrix.md':[expected.npm],
'sdk/release/PUBLISHING.md':['0.1.0-alpha.5'],
'examples/README.md':[expected.npm],
'docs/README.md':['0.1.0-alpha.5']};
const errors=[];
const check=(ok,msg)=>{if(!ok)errors.push(msg)};
const c=JSON.parse(read('sdk/release/public-coordinates.json'));
for(const [k,v] of Object.entries(expected))check(c.coordinates?.[k]?.coordinate===v,'wrong current coordinate '+k);
check(c.frozenPublishedSourceSha==='57971b134a41c3e3ea4b42f68e86a7d117036006','incorrect frozen source');
check(c.independentRegistryAudit==='6/6 PASS','missing independent audit');
const ledger=read('docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md');
for(const v of Object.values(expected))check(ledger.includes(v.replace('Truyn.Sdk@','Truyn.Sdk ')),'ledger missing '+v);
check(read('spec/compatibility/matrix.md').includes('draft'),'false protocol maturity');
check(read('docs/compatibility/TRUYN1_RC_GAP_LEDGER.md').includes('G5'),'G5 omitted');
for(const [p,tokens] of Object.entries(current)){
let s=read(p);
for(const v of tokens)check(s.includes(v),'missing current '+v+' in '+p);
check(!/not yet claimed as a publicly published (?:Maven Central|NuGet) release/.test(s.slice(0,900)),'false non-public '+p);}
const skip=new Set(['.git','node_modules','.next','dist','build','vendor','.venv','coverage','target']);
function markdown(dir=''){let a=[];for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(skip.has(e.name))continue;let p=path.posix.join(dir,e.name);if(e.isDirectory())a.push(...markdown(p));else if(e.isFile()&&p.endsWith('.md'))a.push(p)}return a}
let files=markdown(),old=['@truyn/sdk@0.1.0-alpha.2','truyn-sdk==0.1.0a1','github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.1','org.truyn:truyn-sdk:0.1.0-alpha.1','Truyn.Sdk 0.1.0-alpha.1'];
let reports=[];
for(const p of files){let matches=old.filter(v=>read(p).includes(v));if(!matches.length)continue;const historical=/(?:^docs\/benchmarks\/|^docs\/operations\/(?:DOCUMENTATION_|.*20\d\d)|^docs\/releases\/|\/evidence\/)/.test(p)||/^(?:sdk\/release\/PUBLISHING|docs\/compatibility\/SDK_(?:COMPATIBILITY|PACKAGING)|sdk\/README|docs\/compatibility\/TRUYN1_(?:WIRE_FREEZE|EXPANDED_CORE))\.md$/.test(p);reports.push({path:p,classification:historical?'HISTORICAL_OR_MIXED':'REVIEW_STALE_CONTEXT',tokens:matches})}
const report={schema:'truyn.docs.sanitation/v1',status:errors.length?'FAIL':'PASS',markdownFilesInspected:files.length,currentEntrypointsChecked:Object.keys(current).length,frozenSource:c.frozenPublishedSourceSha,errors,legacyTokenInventory:reports};
fs.mkdirSync('.docs-audit',{recursive:true});fs.writeFileSync('.docs-audit/public-release-status.json',JSON.stringify(report,null,2)+'\n');
console.log('DOC_STATUS '+JSON.stringify({result:report.status,markdown:files.length,currentEntrypoints:report.currentEntrypointsChecked,historical:reports.filter(x=>x.classification.startsWith('HISTORICAL')).length,review:reports.filter(x=>!x.classification.startsWith('HISTORICAL')).length,errors}));
for(const x of reports.filter(x=>x.classification==='REVIEW_STALE_CONTEXT'))console.log('DOC_REVIEW '+x.path);
if(errors.length)process.exitCode=1;

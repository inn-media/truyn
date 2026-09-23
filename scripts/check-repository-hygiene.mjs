#!/usr/bin/env node
import {execFileSync} from 'node:child_process'; import {pathToFileURL} from 'node:url';
export const BUILD_RESIDUE_PATTERNS=[
  [/(?:^|\/)(?:bin|obj)\/(?:Debug|Release)\//,'.NET build output'],
  [/\.(?:dll|pdb|exe|nupkg|snupkg)$/i,'.NET binary/package'],
  [/(?:^|\/)__pycache__\/|\.py[cod]$/,'Python bytecode'],
  [/\.egg-info\//,'Python egg-info build metadata'],
  [/\.(?:class|jar|war)$/i,'JVM build output'],
  [/^sdk\/release\/dist\//,'SDK release staging output'],
];
export function violationsForPaths(paths){const v=[],lower=new Map();for(const p of paths){for(const [re,label] of BUILD_RESIDUE_PATTERNS){if(re.test(p)){v.push(`${p}: committed build residue (${label})`);break;}}const l=p.toLowerCase();if(p.endsWith('.gitkeep'))v.push(`${p}: empty placeholder directory; record planned paths in docs/architecture/PLANNED_MODULES.md`);if(/^adapters\/nlweb\/[^/]+\//.test(p))v.push(`${p}: nested copy under adapters/nlweb (NLWeb bridge modules are flat)`);lower.set(l,[...(lower.get(l)||[]),p]);if(p==='_tmp_parts'||p.startsWith('_tmp_parts/'))v.push(`${p}: temporary root residue`);if(/^\.github\/workflows\/diag-d200-.*\.ya?ml$/i.test(p))v.push(`${p}: obsolete D-200 launcher`);if(/^scripts\/patch-(?:class-d-diagnostic|d200)-/i.test(p))v.push(`${p}: superseded patcher`);if(/(?:\.orig|\.rej|\.bak|~)$/i.test(p))v.push(`${p}: backup/reject residue`);if(/d200-repository-sanitation-executor|apply-d200-repository-sanitation/.test(p))v.push(`${p}: sanitation executor residue`);}for(const [k,a] of lower)if(a.length>1)v.push(`${a.join(',')}: duplicate case-insensitive paths`);const pr=paths.filter(p=>p.toLowerCase()==='.github/pull_request_template.md');if(pr.length!==1)v.push(`PR template count=${pr.length}`);for(const p of paths.filter(x=>x.endsWith('/.gitkeep'))){const d=p.slice(0,-'.gitkeep'.length);if(paths.some(x=>x!==p&&x.startsWith(d)))v.push(`${p}: unnecessary populated-directory .gitkeep`);}return v;}
export function currentPaths(){return execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);}
export function main(){const v=violationsForPaths(currentPaths());if(v.length)throw new Error(`Repository hygiene violations:\n${v.join('\n')}`);console.log('TRUYN_REPOSITORY_HYGIENE=PASS');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}

#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const specPath = process.argv[2];
if (!specPath) throw new Error('repair spec path required');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const run = (cmd,args=[]) => execFileSync(cmd,args,{encoding:'utf8'}).trim();
const head = run('git',['rev-parse','HEAD']);
if (head !== spec.baseSha) throw new Error(`base SHA mismatch: ${head} != ${spec.baseSha}`);
if (!Array.isArray(spec.files) || !spec.files.length) throw new Error('files required');
for (const file of spec.files) {
  let text = await readFile(file.path,'utf8');
  for (const r of file.replacements) {
    const count = text.split(r.from).length - 1;
    if (count !== r.count) throw new Error(`${file.path}: expected ${r.count} matches, got ${count}`);
    text = text.split(r.from).join(r.to);
  }
  await writeFile(file.path,text,'utf8');
}
run('git',['diff','--check']);
const changed = run('git',['diff','--name-only']).split('\n').filter(Boolean).sort();
const expected = spec.files.map(x=>x.path).sort();
if (JSON.stringify(changed)!==JSON.stringify(expected)) throw new Error(`scope mismatch: ${JSON.stringify(changed)}`);
for (const check of spec.checks ?? []) run(check.command, check.args ?? []);
console.log(JSON.stringify({status:'PASS',baseSha:head,changed},null,2));

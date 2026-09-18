#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const classIndex = argv.indexOf('--class');
const classSize = classIndex >= 0 ? Number(argv[classIndex + 1]) : 200;
if (![200, 500, 1000].includes(classSize)) throw new Error(`--class must be one of 200, 500, 1000; received=${argv[classIndex + 1] ?? ''}`);

const forwarded = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--class') { i += 1; continue; }
  forwarded.push(argv[i]);
}

const run = spawnSync(process.execPath, ['scripts/d200-local-multiprocess-repro.mjs', ...forwarded], {
  cwd: process.cwd(),
  env: { ...process.env, TRUYN_CLASS_D_SIZE: String(classSize), TRUYN_CLASS_D_NAME: `D-${classSize}` },
  stdio: 'inherit'
});
const code = run.status ?? 1;
console.log(`TRUYN_CLASS_D_LOCAL_MULTIPROCESS class=D-${classSize} status=${code === 0 ? 'PASS' : 'FAIL'} implementation=shared-real-node-service`);
process.exit(code);

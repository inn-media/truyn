#!/usr/bin/env node
import {spawnSync} from 'node:child_process'; import {testsFor} from './test-suite-map.mjs';
const suite=process.argv[2];if(!suite)throw new Error('suite required');const files=testsFor(suite);if(!files.length)throw new Error(`suite ${suite} selected zero tests`);console.log(`TRUYN_TEST_SUITE=${suite} tests=${files.length}`);const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',env:{...process.env,TRUYN_LOCAL_DEVELOPMENT:'1'}});process.exit(r.status??1);

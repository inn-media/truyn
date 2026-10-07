import { mkdir, rm, cp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const version = process.env.TRUYN_CLIENT_VERSION || '0.1.0-alpha.4';
const sourceSha = process.env.TRUYN_MANAGED_SOURCE_SHA || process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const platforms = ['windows','macos','linux','android'];
const out = path.resolve('dist/managed-clients');

await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund'],{cwd:'sdk/typescript',stdio:'inherit'});
execFileSync('npm',['run','build'],{cwd:'sdk/typescript',stdio:'inherit'});

const manifest={schema:'truyn.managed-client-release/v1',version,sourceSha,contractVersion:'truyn.managed-auth-device/v1',artifacts:[]};
for (const platform of platforms) {
  const root=path.join(out,'truyn-managed-client-'+platform+'-'+version);
  await mkdir(root,{recursive:true});
  await cp('sdk/typescript/dist',path.join(root,'sdk'),{recursive:true});
  const metadata={schema:'truyn.managed-client-artifact/v1',platform,version,sourceSha,contractVersion:'truyn.managed-auth-device/v1'};
  await writeFile(path.join(root,'artifact.json'),JSON.stringify(metadata,null,2)+'\n');
  const archive=path.join(out,'truyn-managed-client-'+platform+'-'+version+'.tgz');
  execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',archive,'-C',out,path.basename(root)]);
  const bytes=await readFile(archive);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(archive+'.sha256',sha256+'  '+path.basename(archive)+'\n');
  manifest.artifacts.push({platform,file:path.basename(archive),sha256});
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');

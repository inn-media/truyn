import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = path.resolve(here, '../src-tauri/gen/android/app/src/main');
const manifestPath = path.join(main, 'AndroidManifest.xml');
const manifestSource = await readFile(manifestPath, 'utf8');

const attrs = [
  ['android:allowBackup', 'false'],
  ['android:fullBackupContent', '@xml/backup_rules'],
  ['android:dataExtractionRules', '@xml/data_extraction_rules']
];

const applicationPattern = /<application\b([^>]*)>/;
if (!applicationPattern.test(manifestSource)) {
  throw new Error('Android manifest application element was not found');
}

let manifest = manifestSource.replace(applicationPattern, (_match, rawAttrs) => {
  let clean = rawAttrs;
  for (const [name] of attrs) {
    clean = clean.replace(new RegExp('\\s+' + name.replace(':', '\\:') + '="[^"]*"', 'g'), '');
  }
  const hardened = attrs.map(([name, value]) => `\n        ${name}="${value}"`).join('');
  return `<application${clean}${hardened}>`;
});

const xmlDir = path.join(main, 'res/xml');
await mkdir(xmlDir, { recursive: true });
await writeFile(manifestPath, manifest);
await copyFile(path.join(here, 'backup_rules.xml'), path.join(xmlDir, 'backup_rules.xml'));
await copyFile(path.join(here, 'data_extraction_rules.xml'), path.join(xmlDir, 'data_extraction_rules.xml'));
console.log('TRUYN_ANDROID_BACKUP_HARDENING=PASS');

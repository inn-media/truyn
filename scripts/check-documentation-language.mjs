#!/usr/bin/env node
// Scan all tracked human-facing documentation. No network or external packages.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const foreign = /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Georgian}\p{Script=Armenian}\p{Script=Greek}\p{Script=Thai}]/u;
const tick = String.fromCharCode(96);
const fenceStart = new RegExp('^ {0,3}(' + tick + '{3,}|~{3,})');
const inlineCode = new RegExp('(' + tick + '+)[^' + tick + ']*?\\1', 'g');
const documentFile = p => new Set(['.md','.mdx','.rst','.adoc']).has(extname(p).toLowerCase()) ||
  (p.startsWith('docs/') && p.endsWith('.txt')) ||
  /(?:^|\/)(?:llms(?:-full)?|humans)\.txt$/i.test(p);

export function inspectDocumentation(path, content) {
  const problems = [];
  if (foreign.test(path)) problems.push(path + ': non-English documentation filename');
  let fence = null;
  content.split(/\r?\n/).forEach((line, index) => {
    const m = line.match(fenceStart);
    if (m) {
      if (!fence) fence = m[1];
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return;
    }
    if (fence) return; // Exact-byte Unicode code examples are test data, not prose.
    if (foreign.test(line.replace(inlineCode, '')))
      problems.push(path + ':' + (index + 1) + ': non-English documentation prose');
  });
  return problems;
}
function selfTest() {
  const t = [
    ['README.md', '# English only', 0],
    ['README.md', '# Пример', 1],
    ['README.md', '中文 text', 1],
    ['docs/Пример.md', '# English', 1],
    ['README.md', 'Test: ' + tick + 'пример' + tick, 0],
    ['README.md', 'Test:\n' + tick.repeat(3) + 'json\n{"example":"Привет"}\n' + tick.repeat(3) + '\nEnglish.', 0]
  ];
  for (const [name, source, expected] of t)
    if (inspectDocumentation(name, source).length !== expected)
      throw Error('Documentation language checker self-test failed');
  console.log('DOCUMENTATION_LANGUAGE_SELF_TEST=PASS');
}
if (process.argv.includes('--self-test')) selfTest();
else {
  const tracked = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
  const violations = [];
  let count = 0;
  for (const name of tracked) {
    if (!documentFile(name)) continue;
    count++;
    try { violations.push(...inspectDocumentation(name, readFileSync(name, 'utf8'))); }
    catch (err) { violations.push(name + ': cannot read UTF-8 documentation'); }
  }
  if (violations.length) {
    console.error('DOCUMENTATION_LANGUAGE=FAIL documents=' + count + ' findings=' + violations.length);
    for (const item of violations.slice(0,150)) console.error(item);
    if (violations.length > 150) console.error('Additional findings: ' + (violations.length - 150));
    process.exitCode = 1;
  } else console.log('DOCUMENTATION_LANGUAGE=PASS documents=' + count);
}

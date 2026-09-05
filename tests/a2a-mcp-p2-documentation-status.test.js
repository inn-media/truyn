import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canonicalDocuments = [
  '../README.md',
  '../ROADMAP.md',
  '../docs/architecture/A2A_MCP_INTEROPERABILITY.md',
  '../docs/architecture/IMPLEMENTATION_STATUS.md',
  '../docs/compatibility/A2A_MCP_COMPATIBILITY.md',
  '../docs/compatibility/A2A_MCP_P2_FINAL_ACCEPTANCE.md',
];

async function load(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('canonical A2A/MCP status stays synchronized with accepted P2-E1 and P2-E2 evidence', async () => {
  for (const relativePath of canonicalDocuments) {
    const content = await load(relativePath);
    assert.match(content, /P2-E1|Sprint E/i, `${relativePath} must retain P2-E1\/Sprint E acceptance context`);
    assert.match(content, /P2-E2|a2a-mcp-pre-v1\/g1/i, `${relativePath} must retain P2-E2\/g1 compatibility context`);
    assert.match(content, /TRUYN\/1[^\n]*draft|Protocol[^\n]*TRUYN\/1[^\n]*draft/i, `${relativePath} must keep TRUYN\/1 draft status explicit`);
  }
});

test('canonical A2A/MCP status does not regress to the superseded open gates', async () => {
  const documents = await Promise.all(canonicalDocuments.map(async (relativePath) => [relativePath, await load(relativePath)]));
  const staleClaims = [
    /external referenced file\/artifact\s+OPEN/i,
    /integrity-verified external round trip still required/i,
    /stable compatibility declaration\s+OPEN/i,
    /define a compatibility\/stability policy before claiming stable A2A\/MCP support/i,
  ];

  for (const [relativePath, content] of documents) {
    for (const staleClaim of staleClaims) {
      assert.doesNotMatch(content, staleClaim, `${relativePath} contains superseded P2 status wording`);
    }
  }
});

test('bounded pre-v1 acceptance never becomes a stable-v1 claim', async () => {
  const [readme, roadmap, status, compatibility] = await Promise.all([
    load('../README.md'),
    load('../ROADMAP.md'),
    load('../docs/architecture/IMPLEMENTATION_STATUS.md'),
    load('../docs/compatibility/A2A_MCP_COMPATIBILITY.md'),
  ]);

  for (const [name, content] of [
    ['README.md', readme],
    ['ROADMAP.md', roadmap],
    ['IMPLEMENTATION_STATUS.md', status],
    ['A2A_MCP_COMPATIBILITY.md', compatibility],
  ]) {
    assert.match(content, /stable A2A\/MCP v1[^\n]*(not declared|NOT DECLARED|not yet declared)|Stable A2A\/MCP v1[^\n]*(not declared|NOT DECLARED|not yet declared)/i, `${name} must keep stable-v1 explicitly undeclared`);
  }
});

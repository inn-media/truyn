import assert from 'node:assert/strict';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SUT_ROOT = process.env.SUT_ROOT;
assert.ok(SUT_ROOT, 'SUT_ROOT is required');
const EXPECTED_SHA = 'a28cba182b9cddde34bc34894180d14cfa166d2b';
const EXPECTED_PIN = 'nlweb-ai/nlweb-typespec@d973d4fe811830eb3734c01a79133adfc474c197';

const client = await import(pathToFileURL(path.join(SUT_ROOT, 'adapters/nlweb/client.js')));
const who = await import(pathToFileURL(path.join(SUT_ROOT, 'adapters/nlweb/who.js')));
assert.equal(client.NLWEB_PROTOCOL_VERSION, '0.5');
assert.equal(client.NLWEB_PINNED_SOURCE, EXPECTED_PIN);

const candidates = [
  { id: 'private-hidden', capabilities: ['answer'], visibility: 'private' },
  { id: 'public-low', capabilities: ['answer'], visibility: 'public' },
  { id: 'public-best', capabilities: ['answer'], visibility: 'public' }
];

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.url !== '/nlweb/who-ask') {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const intent = who.parseNlwebWhoInput(body.who);
    const constraints = who.compileNlwebWhoConstraints(intent);
    const eligible = await who.filterNlwebWhoCandidates({
      candidates,
      constraints,
      canView: async (candidate) => candidate.visibility === 'public',
      authorize: async (candidate) => candidate.capabilities.includes('answer')
    });
    const selected = who.selectNlwebReference({
      eligible,
      signals: {
        'public-low': { health: 0.5, trust: 0.5 },
        'public-best': { health: 1, trust: 1 },
        'private-hidden': { health: 1, trust: 1 }
      }
    });
    const ask = client.createNlwebAskRequest({
      text: body.ask.text,
      requestId: body.ask.requestId,
      conversationId: body.ask.conversationId,
      profileVersion: body.ask.profileVersion
    });
    const raw = await who.composeNlwebWhoToAsk({
      selected,
      ask,
      authority: { principal: 'external-blackbox' },
      authorizeExecution: async ({ candidate }) => candidate.id === 'public-best',
      execute: async ({ candidate, request }) => ({
        structured: { '@type': 'Answer', text: `answered:${request.query.text}` },
        candidate,
        request
      })
    });
    const evidence = who.preserveNlwebWhoAskEvidence({
      selected,
      response: raw.structured,
      correlation: { requestId: ask.meta.request_id, traceId: 'trace-s89' },
      provenance: { executionId: 'exec-s89', source: 'external-nlweb-0.5-blackbox' }
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ eligible: eligible.map((x) => x.id), selected: selected.id, evidence }));
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: error.code || 'ERROR', message: error.message }));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/nlweb/who-ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      who: { query: 'find an answer provider', capability: 'answer' },
      ask: { text: 'hello', requestId: 'req-s89', conversationId: 'conv-s89', profileVersion: '0.5' }
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.eligible, ['public-low', 'public-best']);
  assert.equal(result.selected, 'public-best');
  assert.equal(result.evidence.response['@type'], 'Answer');
  assert.equal(result.evidence.response.text, 'answered:hello');
  assert.equal(result.evidence.correlation.requestId, 'req-s89');
  assert.equal(result.evidence.correlation.traceId, 'trace-s89');
  assert.equal(result.evidence.provenance.providerId, 'public-best');
  assert.equal(result.evidence.provenance.executionId, 'exec-s89');
  assert.equal(result.evidence.provenance.source, 'external-nlweb-0.5-blackbox');
  assert.ok(!JSON.stringify(result).includes('private-hidden'));

  const wrongVersion = await fetch(`http://127.0.0.1:${port}/nlweb/who-ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      who: { capability: 'answer' },
      ask: { text: 'hello', requestId: 'req-bad', profileVersion: '0.4' }
    })
  });
  assert.equal(wrongVersion.status, 400);
  const denied = await wrongVersion.json();
  assert.equal(denied.code, 'UNSUPPORTED_VERSION');

  console.log(JSON.stringify({
    task: 'truyn-open-1-0-productization-7e4c91',
    sprint: 'S89',
    sut_sha: EXPECTED_SHA,
    nlweb_profile: '0.5',
    upstream_pin: EXPECTED_PIN,
    result: 'PASS',
    private_code_used: false,
    eligible: result.eligible,
    selected: result.selected,
    correlation: result.evidence.correlation,
    provenance: result.evidence.provenance
  }, null, 2));
} finally {
  server.close();
}

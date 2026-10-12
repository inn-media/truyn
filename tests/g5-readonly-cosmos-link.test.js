import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { Readable, Writable } from 'node:stream';
import { createG5ReadOnlyCosmosLink } from './fixtures/g5-readonly-cosmos-link.mjs';

// Real loopback sockets; explicitly mocked HTTPS upstream. No Azure calls.
function fixture() {
  const calls = [];
  const link = createG5ReadOnlyCosmosLink({ endpoint:'https://fixture.documents.azure.com',
    database:'g5-live-123456', container:'ledger', logicalId:'g5-live-123456',
    requestImpl(options, receive) {
      calls.push(options);
      const outgoing = new Writable({ write(_chunk, _encoding, done) { done(); } });
      outgoing.once('finish', () => {
        const incoming = Readable.from([JSON.stringify({status:'matched'})]);
        incoming.statusCode = 200; incoming.headers = {'content-type':'application/json'};
        receive(incoming);
      });
      return outgoing;
    }
  });
  return {link, calls};
}
function rawRequest(origin, path, method = 'GET', headers = {}) {
  const address = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = http.request({hostname:address.hostname, port:address.port, path, method, headers}, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject); request.end();
  });
}

test('G5 link: fixed GET preserves only Cosmos headers and real socket cut/heal', {timeout:10000}, async t => {
  const {link,calls} = fixture(); t.after(() => link.close()); await link.open();
  const options = {method:'GET', headers:{authorization:'test-entra',
    'x-ms-session-token':'0:1', host:'untrusted.invalid', 'x-unapproved':'not-forwarded'}};
  assert.equal((await (await link.fetchImpl(link.upstreamUrl, options)).json()).status, 'matched');
  assert.equal(calls.length, 1); assert.equal(calls[0].hostname, 'fixture.documents.azure.com');
  assert.equal(calls[0].port, 443); assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, new URL(link.upstreamUrl).pathname);
  assert.equal(calls[0].headers.authorization, 'test-entra');
  assert.equal(calls[0].headers['x-ms-session-token'], '0:1');
  assert.equal(calls[0].headers.host, undefined);
  assert.equal(calls[0].headers['x-unapproved'], undefined);
  await link.cut();
  await assert.rejects(() => link.fetchImpl(link.upstreamUrl, options));
  assert.equal(calls.length, 1, 'a cut link must never reach upstream');
  await link.open();
  assert.equal((await link.fetchImpl(link.upstreamUrl, options)).status, 200);
  assert.equal(calls.length, 2);
});

test('G5 link: inbound URLs, other documents, queries and write methods never reach HTTPS', async t => {
  const {link,calls} = fixture(); t.after(() => link.close()); await link.open();
  for (const path of ['http://169.254.169.254/metadata/identity', '//other.invalid/',
    '/dbs/production/colls/ledger/docs/other', new URL(link.upstreamUrl).pathname + '?redirect=other']) {
    assert.equal(await rawRequest(link.localOrigin, path), 400);
  }
  for (const method of ['POST','PUT','DELETE','PATCH']) {
    assert.equal(await rawRequest(link.localOrigin, new URL(link.upstreamUrl).pathname, method), 400);
  }
  assert.equal(calls.length, 0);
});

test('G5 link: adapter-side origin, document, credential and body rejection occurs before I/O', async t => {
  const {link,calls} = fixture(); t.after(() => link.close()); await link.open();
  for (const uri of ['https://other.documents.azure.com' + new URL(link.upstreamUrl).pathname,
    link.upstreamUrl + '/other', link.upstreamUrl + '?x=1', link.upstreamUrl + '#x',
    link.upstreamUrl.replace('https://','https://user:pass@')]) {
    await assert.rejects(() => link.fetchImpl(uri, {method:'GET'}), /request_not_allowed/);
  }
  await assert.rejects(() => link.fetchImpl(link.upstreamUrl, {method:'POST'}), /request_not_allowed/);
  await assert.rejects(() => link.fetchImpl(link.upstreamUrl, {method:'GET',body:'x'}), /request_not_allowed/);
  assert.equal(calls.length, 0);
});

test('G5 link: invalid endpoint configuration is never used for a request', () => {
  for (const endpoint of ['http://fixture.documents.azure.com', 'https://attacker.invalid',
    'https://fixture.documents.azure.com:444', 'https://user:pass@fixture.documents.azure.com',
    'https://fixture.documents.azure.com/path', 'https://fixture.documents.azure.com/?x=1']) {
    assert.throws(() => createG5ReadOnlyCosmosLink({endpoint, database:'g5-test',container:'ledger',logicalId:'id'}));
  }
});

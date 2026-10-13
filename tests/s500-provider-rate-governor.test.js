import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProviderRateGovernor, retryAfterMsFromHeaders, estimateRequestTokens, providerRateGovernorFromEnv
} from '../adapters/providers/common/provider-rate-governor.js';
import { createAzureOpenAIProvider } from '../adapters/providers/azure-openai.js';

function clock() {
  let t = 1_000_000;
  const slept = [];
  return { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; }, slept, advance: (ms) => { t += ms; } };
}
const res = (status, headers = {}, body = {}) => ({ status, ok: status < 400, headers: new Headers(headers), json: async () => body, body: null });

test('Retry-After parsing: ms, seconds, durations, reset headers', () => {
  assert.equal(retryAfterMsFromHeaders(new Headers({ 'retry-after-ms': '3927' })), 3927);
  assert.equal(retryAfterMsFromHeaders(new Headers({ 'retry-after': '6' })), 6000);
  assert.equal(retryAfterMsFromHeaders(new Headers({ 'x-ratelimit-reset-tokens': '1m3s', 'x-ratelimit-reset-requests': '350ms' })), 63000);
  assert.equal(retryAfterMsFromHeaders(new Headers({})), null);
});

test('A17 regression: 429 waits the provider Retry-After, not a fixed 60 s', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0 });
  const seq = [res(429, { 'retry-after-ms': '3927' }), res(200)];
  const { response, telemetry } = await gov.run({ key: 'gpt' }, async () => seq.shift());
  assert.equal(response.status, 200);
  assert.deepEqual(c.slept, [3927]);
  assert.equal(telemetry.attempts, 2);
  assert.equal(telemetry.throttled, 1);
  assert.equal(telemetry.retryWaitMs, 3927);
});

test('shared cooldown: concurrent callers of the same deployment do not stampede', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0 });
  await gov.run({ key: 'gpt' }, async ({ attempt }) => (attempt === 1 ? res(429, { 'retry-after': '2' }) : res(200)));
  c.advance(-2000); // pretend a second caller arrives right after the 429
  assert.ok(gov.cooldownRemainingMs('gpt') > 0);
  assert.equal(gov.cooldownRemainingMs('gemini'), 0);
});

test('bounded: gives up with provider_rate_limited instead of hiding minutes of sleep', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0, maxWaitMs: 10_000 });
  await assert.rejects(
    gov.run({ key: 'gpt' }, async () => res(429, { 'retry-after': '42' })),
    (error) => error.code === 'provider_rate_limited' && error.retryAfterMs === 42_000 && error.telemetry.attempts === 1
  );
  assert.equal(gov.stats().rejected, 1);
});

test('TPM pacing: a 54k-token request does not make the next request 429', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0, tpm: 60_000, maxWaitMs: 60_000 });
  await gov.run({ key: 'gpt', estimatedTokens: 54_000 }, async () => res(200));
  await gov.run({ key: 'gpt', estimatedTokens: 300 }, async () => res(200));
  // 6k left; 300 fits -> no wait. Next 54k request must wait for refill.
  assert.deepEqual(c.slept, []);
  await gov.run({ key: 'gpt', estimatedTokens: 54_000 }, async () => res(200));
  assert.deepEqual(c.slept, [48_300]); // refill (54_000 - 5_700) at 1 token/ms, instead of a 429
  // With the default 45 s budget the same request fails fast (routable), never a hidden minute of sleep.
  const strict = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0, tpm: 60_000 });
  await strict.run({ key: 'gpt', estimatedTokens: 54_000 }, async () => res(200));
  await assert.rejects(strict.run({ key: 'gpt', estimatedTokens: 54_000 }, async () => res(200)), /provider_rate_limited/);
});

test('header budget: remaining tokens provide local advisory admission', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0 });
  await gov.run({ key: 'gpt', estimatedTokens: 10 }, async () => res(200, { 'x-ratelimit-remaining-tokens': '100' }));
  await gov.run({ key: 'gpt', estimatedTokens: 5_000 }, async () => res(200));
  assert.deepEqual(c.slept, [1000]);
});

test('aborted request never sends a provider POST', async()=>{
  const controller=new AbortController();controller.abort(new Error('stop'));
  let calls=0;
  await assert.rejects(createProviderRateGovernor().run({signal:controller.signal},()=>{calls++;return res(200);}),/stop/);
  assert.equal(calls,0);
});
test('network failures are not retried and keep attempt telemetry',async()=>{
  let calls=0;
  await assert.rejects(createProviderRateGovernor().run({},()=>{calls++;throw new Error('socket lost');}),e=>e.message==='socket lost'&&e.telemetry.attempts===1);
  assert.equal(calls,1);
});
test('provider execution time does not consume the wait budget',async()=>{
  const c=clock();let calls=0;
  const result=await createProviderRateGovernor({now:c.now,sleep:c.sleep,random:()=>0,maxWaitMs:1000}).run({},()=>{
    c.advance(10000);return ++calls===1?res(429,{'retry-after-ms':'100'}):res(200);
  });
  assert.equal(result.telemetry.retryWaitMs,100);assert.equal(calls,2);
});
test('shared coordinator receives the remaining wait budget and every 429',async()=>{
  const c=clock(),signals=[];
  const gov=createProviderRateGovernor({now:c.now,sleep:c.sleep,random:()=>0,maxWaitMs:1000,
    admission:async({waitBudgetMs})=>{signals.push(waitBudgetMs);c.advance(20);return {waitMs:20};},
    onThrottle:async({retryAfterMs})=>signals.push(retryAfterMs)});
  const out=await gov.run({},({attempt})=>attempt===1?res(429,{'retry-after-ms':'100'}):res(200));
  assert.deepEqual(signals,[1000,100,880]);assert.equal(out.telemetry.admissionWaitMs,40);
});
test('header requests are reserved before subsequent responses',async()=>{
  const c=clock();const gov=createProviderRateGovernor({now:c.now,sleep:c.sleep,random:()=>0});
  await gov.run({},()=>res(200,{'x-ratelimit-remaining-requests':'1'}));
  await gov.run({},()=>res(200));await gov.run({},()=>res(200));
  assert.deepEqual(c.slept,[1000]);
});
test('small explicit Retry-After is preserved and excessive jitter is rejected',async()=>{
  const c=clock();const gov=createProviderRateGovernor({now:c.now,sleep:c.sleep,random:()=>0});
  await gov.run({},({attempt})=>attempt===1?res(429,{'retry-after-ms':'10'}):res(200));
  assert.deepEqual(c.slept,[10]);assert.throws(()=>createProviderRateGovernor({jitterRatio:.5}),/jitterRatio/);
});

test('non-429 errors are never retried (paid POST is not idempotent)', async () => {
  const gov = createProviderRateGovernor({ random: () => 0 });
  let calls = 0;
  const { response } = await gov.run({ key: 'gpt' }, async () => { calls++; return res(500); });
  assert.equal(response.status, 500);
  assert.equal(calls, 1);
});

test('azure-openai adapter: governed 429 retry surfaces providerThrottle telemetry', async () => {
  const c = clock();
  const gov = createProviderRateGovernor({ now: c.now, sleep: c.sleep, random: () => 0 });
  const seq = [res(429, { 'retry-after-ms': '500' }), res(200, {}, { id: 'resp_x', model: 'm', output_text: 'ANSWER=1', usage: { total_tokens: 3 } })];
  const provider = createAzureOpenAIProvider({ endpoint: 'https://example.invalid', model: 'm', apiKey: 'k', fetchImpl: async () => seq.shift(), rateGovernor: gov });
  const out = await provider.execute({ capability: 'c', input: 'q' });
  assert.equal(out.output, 'ANSWER=1');
  assert.equal(out.metadata.providerThrottle.throttled, 1);
  assert.equal(out.metadata.providerThrottle.retryWaitMs, 500);
});

test('azure-openai adapter without governor is unchanged (no retry)', async () => {
  const provider = createAzureOpenAIProvider({ endpoint: 'https://example.invalid', model: 'm', apiKey: 'k', fetchImpl: async () => res(429, {}, { error: { message: 'Rate limit' } }) });
  await assert.rejects(provider.execute({ capability: 'c', input: 'q' }), /Rate limit/);
});

test('env construction is opt-in', () => {
  assert.equal(providerRateGovernorFromEnv({}), null);
  assert.ok(providerRateGovernorFromEnv({ TRUYN_PROVIDER_GOVERNOR: '1', TRUYN_PROVIDER_TPM: '100000' }));
  assert.equal(estimateRequestTokens('x'.repeat(400), 24), 124);
});

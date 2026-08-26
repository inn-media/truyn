import { createRelay } from '../../network/relay/server.js';
import { TruynLocalNodeClient } from '../../sdk/typescript/src/local-node.ts';

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });

const provider = await TruynLocalNodeClient.connect({ relayUrl, name: 'hello-provider' });
const requester = await TruynLocalNodeClient.connect({ relayUrl, name: 'hello-requester' });

try {
  await provider.offer('sdk.echo', { example: 'hello-need-result' });

  const receipt = await requester.need(
    'sdk.echo',
    { text: 'hello TRUYN' },
    { purpose: 'sdk-quickstart' }
  );

  const need = await provider.nextNeed({ timeoutMs: 2_000 });
  const output = { text: `RESULT: ${(need.input as { text: string }).text}` };

  await provider.result(need.needId, output, { example: 'hello-need-result' });

  const result = await requester.waitForResult(receipt.needId, { timeoutMs: 2_000 });
  console.log(JSON.stringify({ ok: result.verification.ok, output: result.output }, null, 2));
} finally {
  requester.close();
  provider.close();
  await relay.close();
}

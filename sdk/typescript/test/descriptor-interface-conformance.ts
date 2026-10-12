import { readFileSync, writeFileSync } from 'node:fs';
import { TruynClient } from '../src/client.ts';
const input = process.env.TRUYN_DESCRIPTOR_CASES_FILE;
const output = process.env.TRUYN_DESCRIPTOR_RESULT_FILE;
if (!input || !output) throw new Error('Descriptor parity input/output required');
const suite = JSON.parse(readFileSync(input, 'utf8'));
const client = new TruynClient({ relayUrl: suite.baseUrl });
const rows: Record<string, unknown>[] = [];
for (const item of suite.cases) {
  try {
    const value = await client.fetchAgentDescriptor(item.url, { publicKeyPem: suite.publicKeyPem });
    rows.push({ id: item.id, ok: true, identity: value.descriptor.identity, protocol: value.selection.protocol,
      interface: value.selection.interface, keyBinding: value.signer.keyBinding });
  } catch (error) { rows.push({ id: item.id, ok: false, message: error instanceof Error ? error.message : String(error) }); }
}
writeFileSync(output, JSON.stringify(rows));

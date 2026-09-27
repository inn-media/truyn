import { spawn } from 'node:child_process';
import { SecretStore, assertSecretReference } from './secret-store.js';

export const LINUX_SECRET_SERVICE_BACKEND = 'linux-secret-service';
const SERVICE = 'TRUYN';

function keyFor(reference) {
  const safe = assertSecretReference(reference);
  if (safe.backend !== LINUX_SECRET_SERVICE_BACKEND) throw new Error(`LinuxSecretServiceSecretStore cannot use backend: ${safe.backend}`);
  return safe.key;
}

function runSecretTool(args, { input, platform = process.platform } = {}) {
  if (platform !== 'linux') return Promise.reject(new Error('Linux Secret Service is supported only on Linux'));
  return new Promise((resolve, reject) => {
    const child = spawn('secret-tool', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => reject(new Error(`Linux Secret Service operation failed: ${error.message}`)));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Linux Secret Service operation failed (${code}): ${stderr.trim() || 'unknown error'}`));
      resolve(stdout.replace(/\r?\n$/, ''));
    });
    child.stdin.end(input ?? '');
  });
}

export async function runLinuxSecretServiceOperation(request, options = {}) {
  const account = String(request.account ?? '');
  if (!account) throw new Error('Linux Secret Service account is required');
  if (request.operation === 'put') {
    if (typeof request.value !== 'string' || request.value.length === 0) throw new Error('Secret value is required');
    await runSecretTool(['store', '--label', `TRUYN ${account}`, 'service', SERVICE, 'account', account], { ...options, input: request.value });
    return { ok: true };
  }
  if (request.operation === 'resolve') {
    try {
      const value = await runSecretTool(['lookup', 'service', SERVICE, 'account', account], options);
      return value ? { found: true, value } : { found: false };
    } catch (error) {
      if (/failed \(1\)/.test(error.message)) return { found: false };
      throw error;
    }
  }
  if (request.operation === 'delete') {
    try { await runSecretTool(['clear', 'service', SERVICE, 'account', account], options); }
    catch (error) { if (!/failed \(1\)/.test(error.message)) throw error; }
    return { ok: true };
  }
  throw new Error('Unsupported Linux Secret Service operation');
}

export class LinuxSecretServiceSecretStore extends SecretStore {
  constructor({ runner = runLinuxSecretServiceOperation } = {}) { super(); this.runner = runner; }
  async put(reference, value) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Secret value is required');
    await this.runner({ operation: 'put', account: keyFor(reference), value });
  }
  async resolve(reference) {
    const result = await this.runner({ operation: 'resolve', account: keyFor(reference) });
    if (!result?.found || typeof result.value !== 'string' || result.value.length === 0) return undefined;
    return result.value;
  }
  async delete(reference) { await this.runner({ operation: 'delete', account: keyFor(reference) }); }
}

import { spawn } from 'node:child_process';
import { SecretStore, assertSecretReference } from './secret-store.js';

export const MACOS_KEYCHAIN_BACKEND = 'macos-keychain';
const SERVICE = 'TRUYN';

function accountFor(reference) {
  const safe = assertSecretReference(reference);
  if (safe.backend !== MACOS_KEYCHAIN_BACKEND) throw new Error(`MacOSKeychainSecretStore cannot use backend: ${safe.backend}`);
  return safe.key;
}

const PYTHON = String.raw`
import ctypes, ctypes.util, json, sys
req=json.load(sys.stdin)
sec=ctypes.CDLL('/System/Library/Frameworks/Security.framework/Security')
cf=ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
service=b'TRUYN'; account=req['account'].encode()
sec.SecKeychainFindGenericPassword.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.POINTER(ctypes.c_uint32),ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_void_p)]
sec.SecKeychainAddGenericPassword.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.c_uint32,ctypes.c_void_p,ctypes.POINTER(ctypes.c_void_p)]
sec.SecKeychainItemDelete.argtypes=[ctypes.c_void_p]
sec.SecKeychainItemFreeContent.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
def find():
  n=ctypes.c_uint32(); data=ctypes.c_void_p(); item=ctypes.c_void_p()
  status=sec.SecKeychainFindGenericPassword(None,len(service),service,len(account),account,ctypes.byref(n),ctypes.byref(data),ctypes.byref(item))
  return status,n,data,item
op=req['operation']
if op=='resolve':
  status,n,data,item=find()
  if status==-25300: print(json.dumps({'found':False})); sys.exit(0)
  if status!=0: raise RuntimeError('SecKeychainFindGenericPassword failed: %d'%status)
  try: value=ctypes.string_at(data,n.value).decode(); print(json.dumps({'found':True,'value':value}))
  finally: sec.SecKeychainItemFreeContent(None,data)
elif op=='delete':
  status,n,data,item=find()
  if status==-25300: print(json.dumps({'ok':True})); sys.exit(0)
  if status!=0: raise RuntimeError('SecKeychainFindGenericPassword failed: %d'%status)
  sec.SecKeychainItemFreeContent(None,data)
  status=sec.SecKeychainItemDelete(item)
  if status!=0: raise RuntimeError('SecKeychainItemDelete failed: %d'%status)
  print(json.dumps({'ok':True}))
elif op=='put':
  status,n,data,item=find()
  if status==0:
    sec.SecKeychainItemFreeContent(None,data); status=sec.SecKeychainItemDelete(item)
    if status!=0: raise RuntimeError('SecKeychainItemDelete failed: %d'%status)
  elif status!=-25300: raise RuntimeError('SecKeychainFindGenericPassword failed: %d'%status)
  value=req['value'].encode(); buf=ctypes.create_string_buffer(value)
  status=sec.SecKeychainAddGenericPassword(None,len(service),service,len(account),account,len(value),buf,None)
  if status!=0: raise RuntimeError('SecKeychainAddGenericPassword failed: %d'%status)
  print(json.dumps({'ok':True}))
else: raise RuntimeError('Unsupported keychain operation')
`;

export async function runMacOSKeychainOperation(request, { platform = process.platform } = {}) {
  if (platform !== 'darwin') throw new Error('macOS Keychain is supported only on macOS');
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/python3', ['-c', PYTHON], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`macOS Keychain operation failed (${code}): ${stderr.trim() || 'unknown error'}`));
      try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('macOS Keychain returned invalid output')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export class MacOSKeychainSecretStore extends SecretStore {
  constructor({ runner = runMacOSKeychainOperation } = {}) { super(); this.runner = runner; }
  async put(reference, value) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Secret value is required');
    await this.runner({ operation: 'put', account: accountFor(reference), value });
  }
  async resolve(reference) {
    const result = await this.runner({ operation: 'resolve', account: accountFor(reference) });
    if (!result?.found || typeof result.value !== 'string' || result.value.length === 0) return undefined;
    return result.value;
  }
  async delete(reference) { await this.runner({ operation: 'delete', account: accountFor(reference) }); }
}

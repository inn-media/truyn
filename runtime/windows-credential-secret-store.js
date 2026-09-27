import { spawn } from 'node:child_process';
import { SecretStore, assertSecretReference } from './secret-store.js';

export const WINDOWS_CREDENTIAL_BACKEND = 'windows-credential-manager';
const TARGET_PREFIX = 'TRUYN/';

function targetFor(reference) {
  const safe = assertSecretReference(reference);
  if (safe.backend !== WINDOWS_CREDENTIAL_BACKEND) throw new Error(`WindowsCredentialSecretStore cannot use backend: ${safe.backend}`);
  return `${TARGET_PREFIX}${safe.key}`;
}

const POWERSHELL = String.raw`
$ErrorActionPreference = 'Stop'
$inputJson = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TruynCred {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredWrite(ref CREDENTIAL c, UInt32 flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr cred);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr buffer);
}
'@
$target = [string]$inputJson.target
switch ([string]$inputJson.operation) {
  'put' {
    $bytes = [Text.Encoding]::Unicode.GetBytes([string]$inputJson.value)
    $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
      [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
      $c = New-Object TruynCred+CREDENTIAL
      $c.Type = 1; $c.TargetName = $target; $c.CredentialBlobSize = $bytes.Length; $c.CredentialBlob = $blob; $c.Persist = 2; $c.UserName = 'TRUYN'
      if (-not [TruynCred]::CredWrite([ref]$c, 0)) { throw "CredWrite failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($blob) }
    '{"ok":true}'
  }
  'resolve' {
    $ptr = [IntPtr]::Zero
    if (-not [TruynCred]::CredRead($target, 1, 0, [ref]$ptr)) { '{"found":false}'; break }
    try {
      $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][TruynCred+CREDENTIAL])
      $value = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob, [int]($c.CredentialBlobSize / 2))
      @{found=$true; value=$value} | ConvertTo-Json -Compress
    } finally { [TruynCred]::CredFree($ptr) }
  }
  'delete' {
    if (-not [TruynCred]::CredDelete($target, 1, 0)) {
      $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if ($code -ne 1168) { throw "CredDelete failed: $code" }
    }
    '{"ok":true}'
  }
  default { throw 'Unsupported credential operation' }
}
`;

export async function runWindowsCredentialOperation(request, { platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('Windows Credential Manager is supported only on Windows');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Windows Credential Manager operation failed (${code}): ${stderr.trim() || 'unknown error'}`));
      try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('Windows Credential Manager returned invalid output')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export class WindowsCredentialSecretStore extends SecretStore {
  constructor({ runner = runWindowsCredentialOperation } = {}) { super(); this.runner = runner; }
  async put(reference, value) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Secret value is required');
    await this.runner({ operation: 'put', target: targetFor(reference), value });
  }
  async resolve(reference) {
    const result = await this.runner({ operation: 'resolve', target: targetFor(reference) });
    if (!result?.found || typeof result.value !== 'string' || result.value.length === 0) return undefined;
    return result.value;
  }
  async delete(reference) { await this.runner({ operation: 'delete', target: targetFor(reference) }); }
}

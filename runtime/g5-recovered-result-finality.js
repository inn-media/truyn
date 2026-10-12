import { createHash } from 'node:crypto';
import { canonicalize, createEnvelope, verifyEnvelope } from '../core/protocol/index.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fault(code,status=409){return Object.assign(new Error(code),{httpStatus:status,publicCode:code});}
function fail(code,status=409){throw fault(code,status);}

// Operator opt-in; callable on a provider host, not an unauthenticated HTTP API.
// No upstream POST, billing finalize/refund, effect promotion or outbox ACK.
export function createRuntimeG5RecoveredResultFinalizer({env=process.env,ledger,timeoutMs=10000}={}) {
  if(env.TRUYN_G5_RECOVERED_RESULT_FINALITY!=='1') return null;
  if(env.TRUYN_G5_DURABLE_AZURE_RECEIPTS!=='1' || env.TRUYN_G5_AZURE_STORE_RESPONSES!=='1' ||
      !['owner-funded','byok'].includes(env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded') ||
      ledger?.kind!=='cosmos-multi-host-v1' || typeof ledger.commitRecoveredResult!=='function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>30000)
    fail('g5_result_finality_configuration_required',503);
  return async function finalize({host,need,signal:callerSignal}={}) {
    if(host?.effectLedger!==ledger || typeof host.recoverStoredEffect!=='function' ||
        typeof host.accessPolicy?.authorize!=='function') fail('g5_result_finality_host_mismatch',503);
    if(!need || need.type!=='NEED' || need.compact || need.chain ||
        !verifyEnvelope(need,{allowedTypes:['NEED']}).ok) fail('invalid_recovered_need',400);
    const original=structuredClone(need), identity=structuredClone(host.node?.identity);
    if(!identity?.privateKeyPem || !identity?.publicKeyPem) fail('g5_result_signing_identity_required',503);
    const controller=new AbortController(), signal=controller.signal;
    const expiresAt=performance.now()+timeoutMs;let reason,timer,interrupt;
    const interrupted=new Promise((_,reject)=>{interrupt=reject;});
    interrupted.catch(()=>{});
    const stop=error=>{if(!reason){reason=error;controller.abort();interrupt(error);}};
    const abort=()=>stop(fault('recovered_result_aborted'));
    const active=()=>{
      if(callerSignal?.aborted)abort();
      if(performance.now()>=expiresAt)stop(fault('g5_result_finality_timeout',503));
      if(reason)throw reason;
    };
    const io=async work=>{active();const value=await Promise.race([
      Promise.resolve().then(()=>{active();return work();}),interrupted]);active();return value;};
    callerSignal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>stop(fault('g5_result_finality_timeout',503)),timeoutMs);
    try {
      if(!(await io(()=>host.accessPolicy.authorize(original)))?.ok) fail('provider_access_denied',403);
      const row=await io(()=>ledger.getNeed(original.id));
      if(!row)fail('lifecycle_not_found',404);
      const savedNeed=row.deliveries?.find(d=>d.kind==='NEED')?.event?.envelope;
      if(row.mode!=='legacy' || row.requester!==original.from || row.provider!==identity.nodeId ||
          row.scope!==original.from || !savedNeed || row.fingerprint!==hash(JSON.stringify(savedNeed)) ||
          canonicalize(savedNeed)!==canonicalize(original)) fail('recovered_need_binding_mismatch');
      if(['cancelled','failed'].includes(row.status))fail(row.status==='cancelled'?'request_cancelled':'request_failed');
      if(row.status==='completed') {
        if(!row.recoveredUsage) fail('request_already_completed');
        const terminal=row.deliveries.find(d=>d.kind==='RESULT');
        if(!terminal)fail('recovered_result_conflict');
        // Durable terminal replay no longer depends on vendor response retention.
        if(!(await io(()=>host.accessPolicy.authorize(original)))?.ok)fail('provider_access_denied',403);
        return await io(()=>ledger.commitRecoveredResult({need:original,provider:identity.nodeId,signal,
          receiptDigest:row.recoveredUsage.receiptDigest,delivery:{kind:'RESULT',recipient:original.from,event:terminal.event}}));
      }
      // Read-only known-response recovery verifies provider scope/ID/output/usage.
      // Missing IDs require the independently reviewed witness path FIRST.
      const recovered=await io(()=>host.recoverStoredEffect({need:original,signal}));
      const effect=await io(()=>ledger.getEffect(original.id)), receipt=effect?.effectReceipt;
      if(recovered?.receiptBoundToEffect!==true || recovered.responseRetrievedByGet!==true ||
          typeof recovered.output!=='string' || !receipt ||
          receipt.responseId!==recovered.providerResponseId || receipt.outputDigest!==hash(recovered.output) ||
          !['input_tokens','output_tokens','total_tokens'].every(k=>receipt.usage?.[k]===recovered.usage?.[k]))
        fail('effect_receipt_unverified');
      if(typeof effect.receiptCapturedAt!=='string' || !Number.isFinite(Date.parse(effect.receiptCapturedAt)))
        fail('effect_receipt_timestamp_missing');
      const receiptDigest=hash(canonicalize(receipt));
      // Stable receipt timestamp/ID gives rival/restarted reconcilers equal bytes.
      const result=createEnvelope({type:'RESULT',from:identity.nodeId,to:original.from,
        publicKeyPem:identity.publicKeyPem,privateKeyPem:identity.privateKeyPem,
        id:'g5-recovered-'+hash(original.id),createdAt:effect.receiptCapturedAt,
        payload:{requestId:original.id,output:recovered.output,metadata:{
          provider:'azure-openai',usage:structuredClone(receipt.usage),
          receiptDigest,recovered:true,usageAccounting:'operational-only',
          providerInvoiceVerified:false,accountingSettled:false}}});
      // Recheck policy after external GET; billing authorization may reserve money
      // and is deliberately NOT invoked by this operational-usage finalizer.
      if(!(await io(()=>host.accessPolicy.authorize(original)))?.ok)fail('provider_access_denied',403);
      return await io(()=>ledger.commitRecoveredResult({need:original,provider:identity.nodeId,receiptDigest,signal,
        delivery:{kind:'RESULT',recipient:original.from,event:{kind:'RESULT',envelope:result}}}));
    } finally {
      clearTimeout(timer);callerSignal?.removeEventListener('abort',abort);
    }
  };
}

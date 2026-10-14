// Reproduce negative signatures with the PUBLIC RFC 8032 section 7.1 test seed.
// Never use this key for a node or deployment. Source GE bytes are immutable input.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createHash, sign } from 'node:crypto';
import { canonicalize, verifyEnvelope, unsignedEnvelope } from '../../core/protocol/index.js';
const read = name => JSON.parse(readFileSync(new URL(`./v1/${name}`, import.meta.url)));
const write = (name, value) => writeFileSync(new URL(`./v1/${name}`, import.meta.url), JSON.stringify(value, null, 2) + '\n');
const source = read('envelope-ge-source.json');
const key = createPrivateKey({format:'der',type:'pkcs8',key:Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60','hex')});
const hash = text => createHash('sha256').update(text).digest('hex');
const gold = read('protocol-envelope-golden-fixtures.json');
gold.cases = gold.cases.filter(c=>!['GE1','GE2','GE3'].includes(c.id));
for(const c of source.cases){
  const envelope={...JSON.parse(c.canonicalUnsigned),signature:c.signature};
  if(canonicalize(unsignedEnvelope(envelope))!==c.canonicalUnsigned || hash(c.canonicalUnsigned)!==c.canonicalUnsignedSha256 || !verifyEnvelope(envelope).ok || sign(null,Buffer.from(c.canonicalUnsigned),key).toString('base64')!==c.signature)throw new Error(`source mismatch ${c.id}`);
  gold.cases.push({id:c.id,canonicalUnsigned:c.canonicalUnsigned,canonicalUnsignedSha256:c.canonicalUnsignedSha256,expected:{ok:true},envelope});
}
write('protocol-envelope-golden-fixtures.json',gold);
const base=JSON.parse(source.cases[2].canonicalUnsigned);
const now=Date.parse('2026-10-11T12:00:30.000Z');
const signExt=(ext)=>{const unsigned=structuredClone(base);unsigned.ext=ext;return {...unsigned,signature:sign(null,Buffer.from(canonicalize(unsigned)),key).toString('base64')};};
const cases=[];
const add=(id,ext,expected,clock=now)=>{
 const envelope=signExt(ext);
 cases.push({id,negotiatedSemantics:['truyn.envelope.ext/1'],now:clock,envelope,expected});
 // Every semantic negative is cryptographically valid and still legacy compatible.
 cases.push({id:id+'.legacy',negotiatedSemantics:[],now:clock,envelope,expected:{ok:true}});
};
const invalid=key=>({ok:false,reason:'invalid_argument',detail:key?'invalid_ext:'+key:'invalid_ext'});
add('ext.valid',base.ext,{ok:true});
add('ext.empty',{}, {ok:true});
add('ext.known-critical',{...base.ext,crit:['traceId','expiresAt','priority','contentType']},{ok:true});
add('ext.unknown-optional',{future:'abc'},{ok:true});
add('ext.critical-hint',{priority:'critical'},{ok:true});
add('ext.null',null,invalid());
add('ext.array',[],invalid());
add('ext.string','x',invalid());
add('ext.number-value',{priority:1},invalid('priority'));
add('ext.nested-value',{future:{}},invalid('future'));
add('ext.bad-key',{'bad-key':'x'},invalid());
add('ext.empty-value',{future:''},invalid('future'));
add('ext.long-value',{future:'a'.repeat(129)},invalid('future'));
add('ext.space',{future:'a b'},invalid('future'));
add('ext.newline',{future:'a\n'},invalid('future'));
add('ext.unicode',{future:'Bakı'},invalid('future'));
add('ext.too-many-keys',Object.fromEntries(Array.from({length:17},(_,i)=>['k'+i,'a'])),invalid());
add('ext.too-many-bytes',Object.fromEntries(Array.from({length:8},(_,i)=>['k'+i,'a'.repeat(128)])),invalid());
add('ext.trace-zero',{traceId:'0'.repeat(32)},invalid('traceId'));
add('ext.trace-case',{traceId:'A'.repeat(32)},invalid('traceId'));
add('ext.expiry-format',{expiresAt:'2026-10-11T12:00:30Z'},invalid('expiresAt'));
add('ext.expiry-calendar',{expiresAt:'2026-02-30T12:00:30.000Z'},invalid('expiresAt'));
add('ext.expiry-not-after',{expiresAt:base.createdAt},invalid('expiresAt'));
add('ext.expiry-skew-boundary',base.ext,{ok:true},now+30000);
add('ext.expired',base.ext,{ok:false,reason:'deadline_exceeded',detail:'envelope_expired'},now+30001);
add('ext.priority-unknown',{priority:'highest'},invalid('priority'));
add('ext.content-media',{contentType:'image/png'},invalid('contentType'));
add('ext.content-unknown',{contentType:'application/json;profile=future/1'},{ok:false,reason:'unimplemented',detail:'unsupported_content_type'});
add('ext.crit-string',{crit:'traceId'},invalid('crit'));
add('ext.crit-number',{crit:[1]},invalid('crit'));
add('ext.crit-missing',{crit:['future']},invalid('crit'));
add('ext.crit-self',{crit:['crit']},invalid('crit'));
add('ext.crit-duplicate',{traceId:base.ext.traceId,crit:['traceId','traceId']},invalid('crit'));
add('ext.crit-unknown',{future:'abc',crit:['future']},{ok:false,reason:'version_mismatch',detail:'required_semantic_unavailable:future'});
const valid=signExt(base.ext);
for(const [id,change] of [
 ['ext.tampered',e=>{e.ext.priority='critical'}],
 ['ext.removed',e=>{delete e.ext}],
 ['ext.injected-crit',e=>{e.ext.crit=['priority']}],
 ['crypto.payload-tampered',e=>{e.payload.input.query='tampered'}],
 ['crypto.base64-whitespace',e=>{e.signature+='\n'}],
 ['crypto.base64-unpadded',e=>{e.signature=e.signature.replace(/=+$/,'')}]
]) {for(const semantics of [[],['truyn.envelope.ext/1']]){const e=structuredClone(valid);change(e);cases.push({id:id+(semantics.length?'':'.legacy'),negotiatedSemantics:semantics,now,envelope:e,expected:{ok:false,reason:'invalid_signature'}})}}
write('envelope-ext-fixtures.json',{schema:'truyn.envelope.ext.conformance/1',source:'Public RFC 8032 TEST 1; generated negatives, exact GE bytes in envelope-ge-source.json',cases});
console.log(`GE ${source.cases.length}; ext cases ${cases.length}`);

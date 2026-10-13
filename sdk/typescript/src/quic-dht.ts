import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomFillSync, sign, verify } from 'node:crypto';
import { QUICSocket, QUICClient } from '@matrixai/quic';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';

const ALPN = 'truyn/1';
const SESSION = 'truyn-peer-session-v1';
const MAX_BYTES = 1_048_576;
const METHODS = new Set(['dht.ping', 'dht.find-node', 'peer.announce', 'dht.store', 'dht.find-value']);
type JSONObject = Record<string, any>;

function canonical(value: unknown): string {
  const seen = new Set<object>();
  function norm(x: any): any {
    if (x === null || typeof x === 'boolean') return x;
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw Error('TCJ1 requires finite numbers');
      return x;
    }
    if (typeof x === 'string') {
      for (let i=0;i<x.length;i++) {
        const code=x.charCodeAt(i);
        if (code>=0xD800&&code<=0xDBFF) {
          const next=x.charCodeAt(++i);
          if (!(next>=0xDC00&&next<=0xDFFF)) throw Error('TCJ1 invalid UTF16');
        } else if (code>=0xDC00&&code<=0xDFFF) throw Error('TCJ1 invalid UTF16');
      }
      return x;
    }
    if (typeof x!=='object' || seen.has(x)) throw Error('TCJ1 invalid JSON');
    seen.add(x);
    let result:any;
    if (Array.isArray(x)) {
      if (Object.keys(x).length!==x.length) throw Error('TCJ1 sparse array');
      result=x.map(norm);
    } else {
      result=Object.fromEntries(Object.keys(x).sort().map(k=>[norm(k),norm(x[k])]));
    }
    seen.delete(x);return result;
  }
  return JSON.stringify(norm(value));
}
const digest = (v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const now=()=>new Date().toISOString();
const without=(obj:JSONObject,...keys:string[])=>Object.fromEntries(Object.entries(obj).filter(([k])=>!keys.includes(k)));

export interface QuicDhtIdentity { nodeId:string; publicKeyPem:string; privateKeyPem:string; }
export interface QuicDhtConnectOptions {
  host:string; port:number; serverName?:string; ca:string;
  expectedNodeId?:string; identity?:QuicDhtIdentity;
}
export function createQuicDhtIdentity(): QuicDhtIdentity {
  const { publicKey,privateKey }=generateKeyPairSync('ed25519');
  const publicKeyPem=publicKey.export({format:'pem',type:'spki'}).toString();
  return {nodeId:'truyn:node:'+sha(publicKey.export({format:'der',type:'spki'})),
    publicKeyPem, privateKeyPem:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
}
function checkIdentity(identity:QuicDhtIdentity) {
  const pub=createPublicKey(identity.publicKeyPem);
  if (pub.asymmetricKeyType!=='ed25519' ||
      identity.nodeId!=='truyn:node:'+sha(pub.export({format:'der',type:'spki'}))) throw Error('quic_invalid_identity');
}
function signer(identity:QuicDhtIdentity,body:JSONObject) {
  return sign(null,Buffer.from(canonical(body)),identity.privateKeyPem).toString('base64');
}
function verifier(nodeId:string,pem:string,signature:string,body:JSONObject) {
  const publicKey=createPublicKey(pem);
  if(publicKey.asymmetricKeyType!=='ed25519' ||
     nodeId!=='truyn:node:'+sha(publicKey.export({format:'der',type:'spki'})) ||
     !verify(null,Buffer.from(canonical(body)),publicKey,Buffer.from(signature,'base64'))) {
    throw Error('invalid_quic_signed_identity_or_signature');
  }
}
function signedRecord(record:JSONObject,kind:'peer'|'dht') {
  if (!record || typeof record!=='object') throw Error('invalid_quic_record');
  const peer=kind==='peer';
  if(record.protocol!==(peer?'truyn-peer-record-v1':'truyn-kademlia-v1'))throw Error('invalid_quic_record_protocol');
  const unsigned=without(record,'signature','publicKey');
  const body=without(unsigned,'recordId');
  if(record.recordId!==(peer?'truyn:peer:':'truyn:dht:')+digest(body))throw Error('invalid_quic_record_id');
  verifier(peer?record.nodeId:record.publisherNodeId,record.publicKey,record.signature,unsigned);
  if(!(Date.parse(record.expiresAt)>Date.now()))throw Error('quic_record_expired');
  if(peer){
    if(record.dhtId!==sha(record.nodeId) || !Array.isArray(record.endpoints)||!record.endpoints.length)
      throw Error('invalid_quic_peer_record');
  }else if(record.keyHash!==sha(record.namespace+':'+record.key) ||
            record.valueDigest!=='sha256:'+digest(record.value))throw Error('invalid_quic_dht_digest');
  return record;
}
async function requestJson(connection:any, value:JSONObject):Promise<JSONObject>{
  const stream=connection.newStream('bidi');
  const reader=stream.readable.getReader();
  const writer=stream.writable.getWriter();
  const data=Buffer.from(JSON.stringify(value));
  if(data.length>MAX_BYTES)throw Error('quic_request_too_large');
  const receive=(async()=>{
    const chunks:Buffer[]=[];let size=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      const chunk=Buffer.from(value);size+=chunk.length;
      if(size>MAX_BYTES)throw Error('quic_response_too_large');
      chunks.push(chunk);
    }
    if(!chunks.length)throw Error('empty_quic_response');
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!result||typeof result!=='object')throw Error('invalid_quic_response');
    return result;
  })();
  try{await writer.write(data);await writer.close();return await receive;}
  finally{writer.releaseLock();reader.releaseLock();}
}

export class QuicDhtClient {
  readonly nodeId:string;
  readonly remoteNodeId:string;
  private constructor(
    readonly identity:QuicDhtIdentity,
    private readonly socket:any,
    private readonly client:any,
    private readonly sessionId:string,
    remoteNodeId:string
  ){this.nodeId=identity.nodeId;this.remoteNodeId=remoteNodeId;}
  static async connect(options:QuicDhtConnectOptions):Promise<QuicDhtClient>{
    if(!options.host||!Number.isInteger(options.port)||options.port<1||options.port>65535||
       !options.ca||!options.ca.includes('BEGIN CERTIFICATE'))throw Error('quic_verified_tls_required');
    const identity=options.identity??createQuicDhtIdentity();checkIdentity(identity);
    const logger=new Logger('TruynSdkNativeQuic',LogLevel.WARN,[new StreamHandler()]);
    const socket=new QUICSocket({logger:logger.getChild('Socket')});
    await socket.start({host:'0.0.0.0',port:0,reuseAddr:true});
    let client:any=null;
    try{
      client=await QUICClient.createQUICClient({
        host:options.host,port:options.port,
        serverName:options.serverName??options.host,socket,logger:logger.getChild('Client'),
        crypto:{ops:{async randomBytes(data:ArrayBuffer){randomFillSync(new Uint8Array(data));}}},
        config:{ca:options.ca,verifyPeer:true,applicationProtos:[ALPN],
          maxIdleTimeout:30_000,keepAliveIntervalTime:10_000}
      });
      const body={protocol:SESSION,kind:'HELLO',nodeId:identity.nodeId,
        transport:'quic',endpoints:[],nonce:randomBytes(24).toString('base64url'),
        issuedAt:now(),protocols:['TRUYN/1'],semantics:[],requiredSemantics:[]};
      const hello={...body,publicKey:identity.publicKeyPem,signature:signer(identity,body)};
      const response=await requestJson(client.connection,{kind:'session-hello',hello});
      if(response.ok!==true||!response.accept)throw Error('quic_hello_denied');
      const accept=response.accept;
      verifier(accept.nodeId,accept.publicKey,accept.signature,without(accept,'publicKey','signature'));
      const helloDigest=digest(without(hello,'signature'));
      const binding='quic:hello:'+helloDigest;
      if(accept.protocol!==SESSION||accept.kind!=='ACCEPT'||
         accept.peerNodeId!==identity.nodeId||accept.helloNonce!==body.nonce||
         accept.helloDigest!==helloDigest||accept.transportBinding!==binding||
         accept.transport!=='quic'||accept.negotiatedProtocol!=='TRUYN/1'||
         JSON.stringify(accept.negotiatedSemantics)!=='[]'||
         !Array.isArray(accept.supportedProtocols)||!accept.supportedProtocols.includes('TRUYN/1')||
         !Number.isFinite(Date.parse(accept.issuedAt))||
         Math.abs(Date.now()-Date.parse(accept.issuedAt))>30_000)
        throw Error('quic_signed_accept_binding_mismatch');
      if(options.expectedNodeId&&accept.nodeId!==options.expectedNodeId)throw Error('quic_wrong_peer_identity');
      const sessionId='truyn:session:'+digest({helloNodeId:identity.nodeId,acceptNodeId:accept.nodeId,
        helloNonce:body.nonce,acceptNonce:accept.nonce,transportBinding:binding});
      if(response.sessionId!==sessionId)throw Error('quic_session_id_mismatch');
      return new QuicDhtClient(identity,socket,client,sessionId,accept.nodeId);
    }catch(e){
      if(client)await client.destroy({force:true}).catch(()=>{});
      await socket.stop({force:true}).catch(()=>{});
      throw e;
    }
  }
  private async rpc(method:string,payload:unknown=null):Promise<JSONObject>{
    if(!METHODS.has(method))throw Error('unsupported_quic_dht_rpc');
    const response=await requestJson(this.client.connection,{kind:'control',sessionId:this.sessionId,method,payload});
    if(response.ok!==true)throw Error('quic_rpc_denied:'+response.error);
    if(!response.result||typeof response.result!=='object')throw Error('invalid_quic_rpc_reply');
    return response.result;
  }
  async ping():Promise<boolean>{
    const result=await this.rpc('dht.ping');
    if(result.pong!==true||result.nodeId!==this.remoteNodeId)throw Error('quic_ping_wrong_peer');
    if(result.peerRecord)signedRecord(result.peerRecord,'peer');return true;
  }
  async findNode(targetNodeId:string):Promise<JSONObject[]>{
    if(!targetNodeId)throw Error('target_node_id_required');
    const result=await this.rpc('dht.find-node',{targetNodeId});
    if(!Array.isArray(result.records)||result.records.length>256)throw Error('invalid_quic_peer_set');
    return result.records.map((r:JSONObject)=>signedRecord(r,'peer'));
  }
  async announce(endpoints:string[],sequence=1):Promise<JSONObject>{
    if(!Array.isArray(endpoints)||!endpoints.length||!Number.isSafeInteger(sequence)||sequence<1)
      throw Error('invalid_quic_announcement');
    const issued=new Date();
    const body={protocol:'truyn-peer-record-v1',nodeId:this.nodeId,dhtId:sha(this.nodeId),
      endpoints:[...new Set(endpoints)].sort(),capabilities:[],nat:null,sequence,
      issuedAt:issued.toISOString(),expiresAt:new Date(issued.getTime()+300_000).toISOString()};
    const signed={recordId:'truyn:peer:'+digest(body),...body};
    const record={...signed,publicKey:this.identity.publicKeyPem,signature:signer(this.identity,signed)};
    const receipt=await this.rpc('peer.announce',{record});
    if(receipt.accepted!==true||receipt.nodeId!==this.nodeId)throw Error('invalid_quic_announce_receipt');
    return receipt;
  }
  async store(namespace:string,key:string,value:unknown,sequence=1):Promise<JSONObject>{
    if(!namespace||!key||!Number.isSafeInteger(sequence)||sequence<1)throw Error('invalid_quic_store');
    const issued=new Date();
    const body={protocol:'truyn-kademlia-v1',namespace,key,keyHash:sha(namespace+':'+key),
      value,valueDigest:'sha256:'+digest(value),publisherNodeId:this.nodeId,sequence,
      issuedAt:issued.toISOString(),expiresAt:new Date(issued.getTime()+300_000).toISOString()};
    const signed={recordId:'truyn:dht:'+digest(body),...body};
    const record={...signed,publicKey:this.identity.publicKeyPem,signature:signer(this.identity,signed)};
    const result=await this.rpc('dht.store',{record});
    if(result.stored!==true||result.recordId!==signed.recordId)throw Error('invalid_quic_store_receipt');
    return result;
  }
  async findValue(namespace:string,key:string):Promise<JSONObject[]>{
    if(!namespace||!key)throw Error('quic_find_value_query_required');
    const result=await this.rpc('dht.find-value',{namespace,key});
    if(!Array.isArray(result.records)||result.records.length>256)throw Error('invalid_quic_dht_set');
    return result.records.map((r:JSONObject)=>signedRecord(r,'dht'));
  }
  async close():Promise<void>{
    await this.client.destroy({force:true});
    await this.socket.stop({force:true});
  }
}

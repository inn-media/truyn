import assert from 'node:assert/strict';
import { createCosmosLifecycleLedger } from '../../network/relay/cosmos-lifecycle-ledger.js';

// Exact adapter requests against a deterministic ETag server model, NOT Azure.
export function maintenanceStore() {
  const docs = new Map();
  let revision=0,writes=0,online=true,queryPages=null,beforePut=null,loseReply=false;
  const reply=(status,value=null,etag=null,continuation=null)=>new Response(value==null?null:JSON.stringify(value),{
    status,headers:{'content-type':'application/json',...(etag?{etag}:{}),...(continuation?{'x-ms-continuation':continuation}:{})}
  });
  async function fetchImpl(uri,options) {
    assert.equal(new URL(uri).hostname,'maintenance.documents.azure.com');
    assert.equal(options.redirect,'error');
    if(!online)throw Error('test-partition');
    if(options.headers['x-ms-documentdb-isquery']==='True') {
      const query=JSON.parse(options.body);
      if(queryPages) {
        const page=Number(options.headers['x-ms-continuation']||0);
        const entry=queryPages[page]||{Documents:[]};
        return reply(200,{Documents:entry.Documents},null,entry.next);
      }
      const owner=query.parameters.find(p=>p.name==='@owner')?.value;
      const recipient=query.parameters.find(p=>p.name==='@recipient')?.value;
      const Documents=owner ? [...docs.values()].filter(d=>d.kind==='offer'&&d.owner===owner&&!d.revoked&&d.offerDirectoryVersion===1)
        : [...docs.values()].filter(d=>d.kind==='need'&&d.deliveries.some(e=>e.recipient===recipient&&e.acknowledgedAt===null&&(e.kind!=='NEED'||d.status==='matched')));
      const start=Number(options.headers['x-ms-continuation']||0);
      return reply(200,{Documents:Documents.slice(start,start+100)},null,start+100<Documents.length?String(start+100):null);
    }
    const key=JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if(options.method==='POST') {
      const data=JSON.parse(options.body);assert.equal(key,data.id);
      if(docs.has(key))return reply(409,{code:'Conflict'});
      const row={...data,_etag:`v${++revision}`};docs.set(key,row);writes++;
      return reply(201,row,row._etag);
    }
    assert.equal(decodeURIComponent(new URL(uri).pathname.split('/').at(-1)),key);
    if(options.method==='GET'){const row=docs.get(key);return row?reply(200,row,row._etag):reply(404);}
    assert.equal(options.method,'PUT');
    if(beforePut){const callback=beforePut;beforePut=null;callback(docs,key);}
    const current=docs.get(key);if(!current)return reply(404);
    if(options.headers['if-match']!==current._etag)return reply(412,{code:'PreconditionFailed'});
    const row={...JSON.parse(options.body),_etag:`v${++revision}`};docs.set(key,row);writes++;
    if(loseReply){loseReply=false;throw Error('committed-but-reply-lost');}
    return reply(200,row,row._etag);
  }
  return {docs,ledger:(options={})=>createCosmosLifecycleLedger({endpoint:'https://maintenance.documents.azure.com',database:'fixture',container:'ledger',getAccessToken:async()=> 'test-token',fetchImpl,...options}),
    get writes(){return writes;},set online(v){online=v;},set queryPages(v){queryPages=v;},
    set beforePut(v){beforePut=v;},set loseReply(v){loseReply=v;}};
}

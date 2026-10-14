import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { TruynNode } from '../node/client.js';
import { verifyEnvelope } from '../core/protocol/index.js';
import { fixture } from '../sdk/conformance/registration-peer/contract.mjs';

test('P11 all 28 confirmation vectors execute through real registration and cannot install rejected tokens',async()=>{
  let active,requests=0;
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    const envelope=JSON.parse(Buffer.concat(chunks).toString()).envelope;
    assert.equal(verifyEnvelope(envelope).ok,true);requests++;
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(active.response));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{
    for(const item of fixture().cases){
      active=item;const node=new TruynNode({relayUrl:`http://127.0.0.1:${server.address().port}`});
      if(item.expected.ok){await node.register({protocols:item.protocols});assert.equal(node.sessionToken,item.response.sessionToken,item.id);}
      else {node.sessionToken='previous-now-revoked-token';await assert.rejects(node.register({protocols:item.protocols}),e=>e.code===item.expected.code,item.id);assert.equal(node.sessionToken,null,item.id);}
    }
    assert.equal(requests,28);
  }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));}
});

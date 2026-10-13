package org.truyn.sdk;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;
import java.util.function.Predicate;

// Package-private implementation shares the owning client's identity and HTTP
// transport. Never re-sign an event with another language or expose a key.
final class CompactLifecycle {
  interface Transport { Map<String,Object> request(String method,String path,Object body); }
  interface Signer { byte[] sign(byte[] message) throws Exception; }
  private final String nodeId;
  private final Transport transport;
  private final Signer signer;
  private final Predicate<Map<String,Object>> envelopeVerifier;
  CompactLifecycle(String nodeId,Transport transport,Signer signer,Predicate<Map<String,Object>> envelopeVerifier){
    this.nodeId=nodeId;this.transport=transport;this.signer=signer;this.envelopeVerifier=envelopeVerifier;
  }
  private static TruynException invalid(String message){return new TruynException(TruynException.Code.INVALID_RESPONSE,message,false);}
  private static Map<String,Object> map(Object... values){var m=new LinkedHashMap<String,Object>();for(int i=0;i<values.length;i+=2)m.put((String)values[i],values[i+1]);return m;}
  private static String text(Object value){return value instanceof String s&&!s.isBlank()?s:null;}
  private Map<String,Object> send(String path,String code,String id,Map<String,Object> payload){
    if(id==null||id.isBlank()||id.length()>4070||!List.of("N","R","T","C","P","D").contains(code))throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"invalid compact identity or kind",false);
    try{
      var signature=Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign(Json.stringify(List.of(code,id,payload)).getBytes(StandardCharsets.UTF_8)));
      return transport.request("POST",path,map("frame",map("t",code,"i",id,"s",signature),"payload",payload));
    }catch(TruynException e){throw e;}catch(Exception e){throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"compact signing failed",false);}
  }
  Map<String,Object> need(String capability,Object input,Map<String,Object> policy){
    if(capability==null||capability.isBlank())throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"capability required",false);
    String id=UUID.randomUUID().toString();
    var r=send("/v1/fast/needs?waitMs=0","N",id,map("capability",map("name",capability),"input",input,"policy",policy==null?Map.of():policy));
    if(!Boolean.TRUE.equals(r.get("ok"))||!id.equals(r.get("needId")))throw invalid("invalid compact NEED receipt");
    return r;
  }
  Map<String,Object> partial(String id,long sequence,Object delta,Map<String,Object> metadata){
    if(sequence<0||sequence>9007199254740991L)throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"sequence must be a non-negative safe integer",false);
    return send("/v1/fast/partials","T",id,map("sequence",sequence,"delta",delta,"metadata",metadata==null?Map.of():metadata));
  }
  Map<String,Object> result(String id,Object output,Map<String,Object> metadata){return send("/v1/fast/results","R",id,map("output",output,"metadata",metadata==null?Map.of():metadata));}
  Map<String,Object> chain(List<Map<String,Object>> stages){
    if(stages==null||stages.size()<2||stages.size()>8)throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"invalid_chain_stages",false);
    return send("/v1/fast/chains","C",UUID.randomUUID().toString(),map("stages",stages));
  }
  Map<String,Object> putContext(List<Map<String,Object>> blocks,List<String> readers,Map<String,Object> metadata){
    if(blocks==null||blocks.isEmpty())throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"context_blocks_required",false);
    var receipt=send("/v1/contexts","P",UUID.randomUUID().toString(),map("blocks",blocks,"readers",readers==null?List.of():readers,"metadata",metadata==null?Map.of():metadata));
    if(!Boolean.TRUE.equals(receipt.get("ok"))||!(receipt.get("cid") instanceof String))throw invalid("invalid context PUT receipt");
    return receipt;
  }
  Map<String,Object> deltaContext(String baseCid,List<Map<String,Object>> ops,List<String> readers,Map<String,Object> metadata){
    if(baseCid==null||baseCid.isBlank()||ops==null||ops.isEmpty())throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"invalid_context_delta",false);
    var receipt=send("/v1/contexts/"+URLEncoder.encode(baseCid,StandardCharsets.UTF_8)+"/delta","D",UUID.randomUUID().toString(),
        map("baseCid",baseCid,"ops",ops,"readers",readers==null?List.of():readers,"metadata",metadata==null?Map.of():metadata));
    if(!Boolean.TRUE.equals(receipt.get("ok"))||!baseCid.equals(receipt.get("baseCid"))||!(receipt.get("cid") instanceof String))throw invalid("invalid context DELTA receipt");
    return receipt;
  }
  List<Map<String,Object>> poll(){
    var response=transport.request("GET","/v1/fast/events?nodeId="+URLEncoder.encode(nodeId,StandardCharsets.UTF_8)+"&waitMs=0",null);
    if(!(response.get("events") instanceof List<?> events)||events.size()>1024)throw invalid("invalid compact events");
    var out=new ArrayList<Map<String,Object>>();
    for(Object raw:events){
      var event=Json.object(raw);String kind=text(event.get("kind"));
      if(event.containsKey("envelope")){
        var env=Json.object(event.get("envelope"));
        if(!List.of("NEED","RESULT","REVOKE").contains(kind)||!kind.equals(env.get("type"))||!envelopeVerifier.test(env))throw invalid("invalid signed lifecycle envelope");
        var verified=new LinkedHashMap<>(event);verified.put("verification",Map.of("ok",true));out.add(verified);continue;
      }
      String code=Map.of("NEED","N","RESULT","R","PARTIAL","T").get(kind);
      var frame=Json.object(event.get("frame"));var payload=Json.object(event.get("payload"));
      String id=text(frame.get("i")),signature=text(frame.get("s")),from=text(event.get("from"));
      if(code==null||!code.equals(frame.get("t"))||id==null||id.length()>4070||signature==null||signature.length()!=86||from==null)throw invalid("invalid direct compact event");
      if(event.containsKey("signedType")&&!kind.equals(event.get("signedType"))||event.containsKey("priorResult"))throw invalid("compact translation or CHAIN unsupported");
      try{
        byte[] sig=Base64.getUrlDecoder().decode(signature);
        if(sig.length!=64||!Base64.getUrlEncoder().withoutPadding().encodeToString(sig).equals(signature))throw invalid("noncanonical compact signature");
        var identity=transport.request("GET","/v1/nodes/"+URLEncoder.encode(from,StandardCharsets.UTF_8),null);
        String key=text(identity.get("publicKey"));if(key==null||!from.equals(identity.get("nodeId")))throw invalid("compact signer mismatch");
        byte[] der=Base64.getDecoder().decode(key.replaceAll("-----BEGIN [^-]+-----","").replaceAll("-----END [^-]+-----","").replaceAll("\\s",""));
        String bound="truyn:node:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(der));
        if(!bound.equals(from))throw invalid("compact key identity mismatch");
        var verifier=Signature.getInstance("Ed25519");verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(der)));
        verifier.update(Json.stringify(List.of(code,id,payload)).getBytes(StandardCharsets.UTF_8));
        if(!verifier.verify(sig))throw invalid("compact signature verification failed");
      }catch(TruynException e){throw e;}catch(Exception e){throw invalid("compact verification failed");}
      if("PARTIAL".equals(kind)){
        Object value=payload.get("sequence");
        if(!(value instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<0||n.doubleValue()>9007199254740991L||Math.floor(n.doubleValue())!=n.doubleValue()||!payload.containsKey("delta"))throw invalid("invalid signed PARTIAL payload");
      }
      var verified=new LinkedHashMap<>(event);verified.put("verification",Map.of("ok",true,"type",kind));out.add(verified);
    }
    return out;
  }
}

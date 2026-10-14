package org.truyn.sdk;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Predicate;

public final class TruynClient {
  public static final String PROTOCOL="TRUYN/1"; public static final String AGENT_DESCRIPTOR_SCHEMA="truyn.agent-descriptor/v1";
  private static final DateTimeFormatter ISO_MILLIS=DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
  private final Config config; private final HttpClient http; private final KeyPair keyPair; private final String publicKeyPem; private final String nodeId; private String sessionToken; private final List<Event> pending=new ArrayList<>();
  private TruynClient(Config config){this.config=config;try{this.keyPair=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();this.publicKeyPem=pem("PUBLIC KEY",keyPair.getPublic().getEncoded());this.nodeId="truyn:node:"+hex(MessageDigest.getInstance("SHA-256").digest(keyPair.getPublic().getEncoded()));}catch(Exception e){throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"cannot create Ed25519 identity: "+e.getMessage(),false);}this.sessionToken=config.authToken().orElse(null);this.http=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(config.timeout()).build();}
  public static Builder builder(){return new Builder();} public Config config(){return config;} public String nodeId(){return nodeId;}
  public static TruynClient connect(URI baseUrl,String name){TruynClient client=builder().baseUrl(baseUrl).build();client.register(name);return client;}
  public CompletableFuture<TruynModels.Identity> identity(){return CompletableFuture.completedFuture(new TruynModels.Identity(nodeId,publicKeyPem));}
  // Opt-in recovery. Caller must verify compact/legacy signature and persist
  // before ACK; retrieval never executes, settles or auto-acknowledges work.
  public CompletableFuture<List<Map<String,Object>>> recoverDurable(int limit){return future(()->{
    if(limit<1||limit>100)throw invalid("limit must be 1..100");
    Map<String,Object> response=request("GET","/v1/lifecycle/deliveries?limit="+limit,null,true);
    Object entries=response.get("deliveries");
    if(!(entries instanceof List<?> list))throw invalid("Missing durable deliveries");
    List<Map<String,Object>> result=new ArrayList<>();
    for(Object entry:list)result.add(Json.object(entry));
    return List.copyOf(result);
  });}
  public CompletableFuture<Map<String,Object>> acknowledgeDurable(String eventId){return future(()->{
    require(eventId,"eventId required");
    return request("POST","/v1/lifecycle/deliveries/ack",map("eventId",eventId),true);
  });}

  public void register(String name){
    sessionToken=null;
    Map<String,Object> payload=map("nodeId",nodeId,"algorithm","Ed25519","protocols",config.supportedProtocols(),"name",name);
    Map<String,Object> response=request("POST","/v1/register",map("envelope",envelope("IDENTITY",payload)),false);
    boolean hasProtocol=response.containsKey("negotiatedProtocol"),hasSemantics=response.containsKey("negotiatedSemantics");
    boolean validSelection=!hasProtocol&&!hasSemantics;
    if(hasProtocol&&hasSemantics)validSelection=PROTOCOL.equals(response.get("negotiatedProtocol"))
      &&response.get("negotiatedSemantics") instanceof List<?> values&&values.isEmpty();
    if(!config.supportedProtocols().contains(PROTOCOL)||!validSelection)
      throw new TruynException(TruynException.Code.VERSION_MISMATCH,"invalid relay negotiation confirmation",false);
    Object token=response.get("sessionToken");
    if(!(token instanceof String text)||text.isBlank())throw new TruynException(TruynException.Code.INVALID_RESPONSE,"relay returned an invalid registration response",false);
    sessionToken=text;
  }
  public CompletableFuture<List<TruynModels.Offer>> discover(String capability){return future(()->{require(capability,"capability is required");Map<String,Object> response=request("GET","/v1/offers?capability="+URLEncoder.encode(capability,StandardCharsets.UTF_8),null,true);Object raw=response.get("offers");if(!(raw instanceof List<?> list))throw invalid("relay returned an invalid authorized discovery response");List<TruynModels.Offer> offers=new ArrayList<>();for(Object item:list)offers.add(offer(Json.object(item)));return List.copyOf(offers);});}
  public CompletableFuture<Map<String,Object>> offer(String capability,Map<String,Object> metadata){return future(()->{require(capability,"capability is required");return request("POST","/v1/offers",map("envelope",envelope("OFFER",map("capability",map("name",capability),"metadata",metadata==null?Map.of():metadata))),true);});}
  public CompletableFuture<TruynModels.Offer> publishOffer(TruynModels.Offer offer){Objects.requireNonNull(offer);return future(()->{request("POST","/v1/offers",map("envelope",offer),true);return offer;});}
  public CompletableFuture<Void> revokeOffer(String offerId){return future(()->{revoke(offerId,"offer","revoked_by_owner");return null;});}
  public CompletableFuture<NeedReceipt> need(String capability,Object input,Map<String,Object> policy){return future(()->{require(capability,"capability is required");Map<String,Object> response=request("POST","/v1/needs",map("envelope",envelope("NEED",map("capability",map("name",capability),"input",input,"policy",policy==null?Map.of():policy))),true);boolean ok=Boolean.TRUE.equals(response.get("ok"));String needId=string(response.get("needId"));String provider=string(response.get("provider"));if(!ok||needId==null||provider==null)throw invalid("relay returned an invalid NEED receipt");return new NeedReceipt(ok,needId,provider,response.get("providerTrust"));});}
  public CompletableFuture<TruynModels.Need> submitNeed(TruynModels.Need need){Objects.requireNonNull(need);return future(()->{request("POST","/v1/needs",map("envelope",need),true);return need;});}
  public CompletableFuture<Map<String,Object>> sendResult(String requestId,Object output,Map<String,Object> metadata){return future(()->{require(requestId,"request ID is required");return request("POST","/v1/results",map("envelope",envelope("RESULT",map("requestId",requestId,"output",output,"completedAt",now(),"metadata",metadata==null?Map.of():metadata))),true);});}
  public CompletableFuture<NeedEvent> nextNeed(Duration timeout){return future(()->{Event event=waitEvent(candidate->"NEED".equals(candidate.kind()),timeout);if(!event.verified())throw invalid("received NEED failed signature verification");Map<String,Object> env=event.envelope();Map<String,Object> payload=Json.object(env.get("payload"));Map<String,Object> cap=Json.object(payload.get("capability"));return new NeedEvent(string(env.get("id")),string(env.get("from")),string(cap.get("name")),payload.get("input"),payload.get("policy"),env);});}
  public CompletableFuture<ResultEvent> waitForResult(String needId,Duration timeout){return future(()->{require(needId,"need ID is required");Event event=waitEvent(candidate->{if(!"RESULT".equals(candidate.kind()))return false;Map<String,Object> payload=Json.object(candidate.envelope().get("payload"));return needId.equals(payload.get("requestId"));},timeout);if(!event.verified())throw invalid("received RESULT failed signature verification");Map<String,Object> payload=Json.object(event.envelope().get("payload"));return new ResultEvent(needId,string(event.envelope().get("from")),payload.get("output"),payload.get("metadata"),event.trust(),event.envelope());});}
  public CompletableFuture<TruynModels.Result> result(String needId){return waitForResult(needId,config.timeout()).thenApply(event->result(event.envelope()));}
  public CompletableFuture<Void> cancelNeed(String needId,String reason){return future(()->{revoke(needId,"need",reason==null||reason.isBlank()?"revoked_by_owner":reason);return null;});}
  public CompletableFuture<TruynModels.AgentDescriptor> agentDescriptor(URI url){Objects.requireNonNull(url);return CompletableFuture.failedFuture(new TruynException(TruynException.Code.UNIMPLEMENTED,"Agent Descriptor serving/discovery lifecycle is outside the Developer Release Layer",false));}
  public List<Event> poll(){Map<String,Object> response=request("GET","/v1/events?nodeId="+URLEncoder.encode(nodeId,StandardCharsets.UTF_8),null,true);Object raw=response.get("events");if(!(raw instanceof List<?> list))throw invalid("relay returned an invalid events response");List<Event> events=new ArrayList<>();for(Object item:list){Map<String,Object> source=Json.object(item);Map<String,Object> env=Json.object(source.get("envelope"));events.add(new Event(string(source.get("kind")),env,verify(env),source.get("trust")));}return events;}

  // Native direct compact successor; same private identity and normalized HTTP.
  private CompactLifecycle compactLifecycle(){return new CompactLifecycle(nodeId,(method,path,body)->request(method,path,body,true),message->{var signer=Signature.getInstance("Ed25519");signer.initSign(keyPair.getPrivate());signer.update(message);return signer.sign();},this::verify);}
  public CompletableFuture<Map<String,Object>> compactNeed(String capability,Object input,Map<String,Object> policy){return future(()->compactLifecycle().need(capability,input,policy));}
  public CompletableFuture<Map<String,Object>> partial(String requestId,long sequence,Object delta,Map<String,Object> metadata){return future(()->compactLifecycle().partial(requestId,sequence,delta,metadata));}
  public CompletableFuture<Map<String,Object>> compactResult(String requestId,Object output,Map<String,Object> metadata){return future(()->compactLifecycle().result(requestId,output,metadata));}
  // CHAIN waits on remote provider stages: the caller must keep polling while it runs.
  public CompletableFuture<Map<String,Object>> compactChain(List<Map<String,Object>> stages){
    return CompletableFuture.supplyAsync(()->compactLifecycle().chain(stages));
  }
  public CompletableFuture<Map<String,Object>> putContext(List<Map<String,Object>> blocks,List<String> readers,Map<String,Object> metadata){return future(()->compactLifecycle().putContext(blocks,readers,metadata));}
  public CompletableFuture<Map<String,Object>> deltaContext(String baseCid,List<Map<String,Object>> ops,List<String> readers,Map<String,Object> metadata){return future(()->compactLifecycle().deltaContext(baseCid,ops,readers,metadata));}
  public List<Map<String,Object>> pollCompact(){return compactLifecycle().poll();}

  private Event waitEvent(Predicate<Event> predicate,Duration timeout){Instant deadline=Instant.now().plus(timeout==null?config.timeout():timeout);while(true){synchronized(pending){for(int i=0;i<pending.size();i++)if(predicate.test(pending.get(i)))return pending.remove(i);}List<Event> events=poll();for(int i=0;i<events.size();i++){Event event=events.get(i);if(predicate.test(event)){events.remove(i);synchronized(pending){pending.addAll(events);}return event;}}synchronized(pending){pending.addAll(events);}if(Instant.now().isAfter(deadline))throw new TruynException(TruynException.Code.DEADLINE_EXCEEDED,"timed out waiting for TRUYN event",true);try{Thread.sleep(20);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new TruynException(TruynException.Code.CANCELLED,"operation cancelled",false);}}}
  private void revoke(String id,String kind,String reason){require(id,"target ID is required");if(!kind.equals("offer")&&!kind.equals("need"))throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"targetKind must be need or offer",false);request("POST","/v1/revoke",map("envelope",envelope("REVOKE",map("targetId",id,"targetKind",kind,"reason",reason))),true);}
  private Map<String,Object> envelope(String type,Map<String,Object> payload){try{Map<String,Object> unsigned=map("protocol",PROTOCOL,"type",type,"id",UUID.randomUUID().toString(),"from",nodeId,"to",null,"createdAt",now(),"publicKey",publicKeyPem,"payload",payload);Signature signer=Signature.getInstance("Ed25519");signer.initSign(keyPair.getPrivate());signer.update(Json.stringify(unsigned).getBytes(StandardCharsets.UTF_8));Map<String,Object> env=new LinkedHashMap<>(unsigned);env.put("signature",Base64.getEncoder().encodeToString(signer.sign()));return env;}catch(Exception e){throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"cannot sign envelope: "+e.getMessage(),false);}}
  private boolean verify(Map<String,Object> envelope){try{String from=string(envelope.get("from"));String keyPem=string(envelope.get("publicKey"));String sig=string(envelope.get("signature"));if(from==null||keyPem==null||sig==null||!PROTOCOL.equals(envelope.get("protocol")))return false;byte[] der=decodePem(keyPem);if(!from.equals("truyn:node:"+hex(MessageDigest.getInstance("SHA-256").digest(der))))return false;var publicKey=java.security.KeyFactory.getInstance("Ed25519").generatePublic(new java.security.spec.X509EncodedKeySpec(der));Map<String,Object> unsigned=new LinkedHashMap<>(envelope);unsigned.remove("signature");Signature verifier=Signature.getInstance("Ed25519");verifier.initVerify(publicKey);verifier.update(Json.stringify(unsigned).getBytes(StandardCharsets.UTF_8));return verifier.verify(Base64.getDecoder().decode(sig));}catch(Exception e){return false;}}
  private Map<String,Object> request(String method,String path,Object body,boolean auth){try{HttpRequest.Builder builder=HttpRequest.newBuilder(config.baseUrl().resolve(path)).timeout(config.timeout()).header("accept","application/json");if(auth){if(sessionToken==null||sessionToken.isBlank())throw new TruynException(TruynException.Code.UNAUTHENTICATED,"a relay session token is required",false);builder.header("authorization","Bearer "+sessionToken);}if(body==null)builder.method(method,HttpRequest.BodyPublishers.noBody());else builder.header("content-type","application/json").method(method,HttpRequest.BodyPublishers.ofString(Json.stringify(body)));HttpResponse<String> response=http.send(builder.build(),HttpResponse.BodyHandlers.ofString());Map<String,Object> parsed=Json.object(Json.parse(response.body()));if(response.statusCode()<200||response.statusCode()>=300){Object source=parsed.get("error");String code=source instanceof Map<?,?> map?string(map.get("code")):string(source);String detail=source instanceof Map<?,?> map?string(map.get("message")):null;throw TruynException.fromHttp(response.statusCode(),code,detail==null?(code==null?"HTTP "+response.statusCode():code):detail);}return parsed;}catch(TruynException e){throw e;}catch(Exception e){throw new TruynException(TruynException.Code.TRANSPORT,e.getMessage(),true);}}

  private static <T> CompletableFuture<T> future(java.util.concurrent.Callable<T> call){try{return CompletableFuture.completedFuture(call.call());}catch(Throwable e){return CompletableFuture.failedFuture(e);}}
  private static String now(){return ISO_MILLIS.format(Instant.now().truncatedTo(ChronoUnit.MILLIS));}
  private static String pem(String type,byte[] bytes){String encoded=Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(bytes);return "-----BEGIN "+type+"-----\n"+encoded+"\n-----END "+type+"-----\n";}
  private static byte[] decodePem(String pem){String clean=pem.replaceAll("-----BEGIN [^-]+-----","").replaceAll("-----END [^-]+-----","").replaceAll("\\s","");return Base64.getDecoder().decode(clean);}
  private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format("%02x",b));return out.toString();}
  private static String string(Object value){return value instanceof String s&&!s.isBlank()?s:null;} private static void require(String value,String message){if(value==null||value.isBlank())throw new TruynException(TruynException.Code.INVALID_ARGUMENT,message,false);} private static TruynException invalid(String message){return new TruynException(TruynException.Code.INVALID_RESPONSE,message,false);}
  private static Map<String,Object> map(Object... values){LinkedHashMap<String,Object> map=new LinkedHashMap<>();for(int i=0;i<values.length;i+=2)map.put((String)values[i],values[i+1]);return map;}
  private static TruynModels.Capability capability(Object value){Map<String,Object> m=Json.object(value);return new TruynModels.Capability(string(m.get("id")),string(m.get("name")));}
  private static TruynModels.Offer offer(Map<String,Object> m){Map<String,Object> p=Json.object(m.get("payload"));return new TruynModels.Offer(string(m.get("protocol")),string(m.get("type")),string(m.get("id")),string(m.get("from")),string(m.get("to")),string(m.get("createdAt")),string(m.get("publicKey")),new TruynModels.OfferPayload(capability(p.get("capability")),Json.object(p.get("metadata"))),string(m.get("signature")));}
  private static TruynModels.Result result(Map<String,Object> m){Map<String,Object> p=Json.object(m.get("payload"));return new TruynModels.Result(string(m.get("protocol")),string(m.get("type")),string(m.get("id")),string(m.get("from")),string(m.get("to")),string(m.get("createdAt")),string(m.get("publicKey")),new TruynModels.ResultPayload(string(p.get("requestId")),p.get("output"),string(p.get("completedAt")),Json.object(p.get("metadata"))),string(m.get("signature")));}
  public record Config(URI baseUrl,Optional<String> authToken,List<String> supportedProtocols,Duration timeout){}
  public static final class Builder{private URI baseUrl;private String authToken;private List<String> supportedProtocols=List.of(PROTOCOL);private Duration timeout=Duration.ofSeconds(30);public Builder baseUrl(URI value){baseUrl=value;return this;}public Builder authToken(String value){authToken=value;return this;}public Builder supportedProtocols(List<String> value){supportedProtocols=List.copyOf(Objects.requireNonNull(value));return this;}public Builder timeout(Duration value){timeout=Objects.requireNonNull(value);return this;}public TruynClient build(){Objects.requireNonNull(baseUrl,"base URL is required");if(!"http".equals(baseUrl.getScheme())&&!"https".equals(baseUrl.getScheme()))throw new TruynException(TruynException.Code.INVALID_ARGUMENT,"base URL must use HTTP(S)",false);return new TruynClient(new Config(baseUrl,Optional.ofNullable(authToken),supportedProtocols,timeout));}}
  public record NeedReceipt(boolean ok,String needId,String provider,Object providerTrust){} public record Event(String kind,Map<String,Object> envelope,boolean verified,Object trust){} public record NeedEvent(String needId,String requester,String capability,Object input,Object policy,Map<String,Object> envelope){} public record ResultEvent(String needId,String provider,Object output,Object metadata,Object trust,Map<String,Object> envelope){}
}

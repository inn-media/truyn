package org.truyn.sdk;

import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.nio.NioDatagramChannel;
import io.netty.handler.codec.quic.*;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;

/** Native QUIC/UDP five-DHT RPC SDK using patched Netty QUIC 4.2.
 *  No Node subprocess, HTTP proxy, disabled TLS, or implicit write retries.
 *  TLS/ALPN AND Ed25519 signed HELLO/ACCEPT are required for every session.
 */
public final class QuicDhtClient implements AutoCloseable {
  private static final String SESSION="truyn-peer-session-v1";
  private static final int MAX=1_048_576;
  private static final int TIMEOUT=20;
  private final EventLoopGroup group;
  private final Channel udp;
  private final QuicChannel channel;
  private final KeyPair identity;
  private final String nodeId;
  private final String publicPem;
  private final String remoteNodeId;
  private final String sessionId;

  private QuicDhtClient(EventLoopGroup group,Channel udp,QuicChannel channel,KeyPair identity,
      String nodeId,String publicPem,String remoteNodeId,String sessionId){
    this.group=group;this.udp=udp;this.channel=channel;this.identity=identity;
    this.nodeId=nodeId;this.publicPem=publicPem;this.remoteNodeId=remoteNodeId;this.sessionId=sessionId;
  }
  public String nodeId(){return nodeId;}
  public String remoteNodeId(){return remoteNodeId;}

  private static String require(Object v,String name){
    if(!(v instanceof String s)||s.isBlank())throw new IllegalArgumentException(name+" required");
    return s;
  }
  private static byte[] shaBytes(byte[] b){try{return MessageDigest.getInstance("SHA-256").digest(b);}catch(Exception e){throw new IllegalStateException(e);}}
  private static String hex(byte[] b){return HexFormat.of().formatHex(b);}
  private static String sha(Object v){return hex(shaBytes(Json.stringify(v).getBytes(StandardCharsets.UTF_8)));}
  private static String rawSha(String s){return hex(shaBytes(s.getBytes(StandardCharsets.UTF_8)));}
  private static String pem(byte[] der){
    var encoded=Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(der);
    return "-----BEGIN PUBLIC KEY-----\n"+encoded+"\n-----END PUBLIC KEY-----\n";
  }
  private static byte[] decodePem(String text){
    return Base64.getDecoder().decode(text.replaceAll("-----BEGIN [^-]+-----","")
      .replaceAll("-----END [^-]+-----","").replaceAll("\\s",""));
  }
  private static String sign(PrivateKey key,Map<String,Object> body){
    try{
      var signer=Signature.getInstance("Ed25519");signer.initSign(key);
      signer.update(Json.stringify(body).getBytes(StandardCharsets.UTF_8));
      return Base64.getEncoder().encodeToString(signer.sign());
    }catch(Exception e){throw new IllegalStateException("native_quic_ed25519_sign_failed",e);}
  }
  private static void verify(String id,String pub,String signature,Map<String,Object> body){
    try{
      byte[] der=decodePem(pub);
      if(!("truyn:node:"+hex(shaBytes(der))).equals(id))throw new SecurityException("quic_node_key_mismatch");
      var publicKey=KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(der));
      var verifier=Signature.getInstance("Ed25519");verifier.initVerify(publicKey);
      verifier.update(Json.stringify(body).getBytes(StandardCharsets.UTF_8));
      if(!verifier.verify(Base64.getDecoder().decode(signature)))throw new SecurityException("quic_ed25519_invalid_signature");
    }catch(SecurityException e){throw e;}catch(Exception e){throw new SecurityException("quic_invalid_signed_identity",e);}
  }
  private static Map<String,Object> m(Object... pairs){
    var out=new LinkedHashMap<String,Object>();
    for(int i=0;i<pairs.length;i+=2)out.put((String)pairs[i],pairs[i+1]);
    return out;
  }
  private static Map<String,Object> without(Map<String,Object> m,String... fields){
    var out=new LinkedHashMap<>(m);
    for(String field:fields)out.remove(field);
    return out;
  }
  private static String utc(){return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();}
  private static boolean recent(Object value){
    try{return Math.abs(Instant.now().toEpochMilli()-Instant.parse(require(value,"issuedAt")).toEpochMilli())<=30_000;}
    catch(Exception e){return false;}
  }
  private static Map<String,Object> obj(Object value){return Json.object(value);}
  private static Map<String,Object> send(QuicChannel connection,Map<String,Object> message)throws Exception {
    final CompletableFuture<Map<String,Object>> received=new CompletableFuture<>();
    final ByteArrayOutputStream output=new ByteArrayOutputStream();
    QuicStreamChannel stream=connection.createStream(QuicStreamType.BIDIRECTIONAL,new SimpleChannelInboundHandler<ByteBuf>(){
      @Override protected void channelRead0(ChannelHandlerContext ctx,ByteBuf buf){
        try{
          int length=buf.readableBytes();
          if(output.size()+length>MAX)throw new IllegalStateException("quic_response_too_large");
          byte[] data=new byte[length];buf.readBytes(data);output.write(data);
        }catch(Exception e){received.completeExceptionally(e);ctx.close();}
      }
      @Override public void channelInactive(ChannelHandlerContext ctx){
        if(!received.isDone()){
          try{received.complete(obj(Json.parse(output.toString(StandardCharsets.UTF_8))));}
          catch(Exception e){received.completeExceptionally(e);}
        }
        ctx.fireChannelInactive();
      }
      @Override public void exceptionCaught(ChannelHandlerContext ctx,Throwable cause){
        received.completeExceptionally(cause);ctx.close();
      }
    }).get(TIMEOUT,TimeUnit.SECONDS);
    byte[] bytes=Json.stringify(message).getBytes(StandardCharsets.UTF_8);
    if(bytes.length>MAX)throw new IllegalArgumentException("quic_request_too_large");
    stream.writeAndFlush(Unpooled.wrappedBuffer(bytes)).sync();
    stream.shutdownOutput().sync();
    return received.get(TIMEOUT,TimeUnit.SECONDS);
  }

  public static QuicDhtClient connect(String host,int port,File trustedCa,String expectedNodeId)throws Exception{
    if(host==null||host.isBlank()||port<1||port>65535||trustedCa==null||
       !trustedCa.isFile())throw new IllegalArgumentException("QUIC trusted CA required");
    var identity=KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    String publicPem=pem(identity.getPublic().getEncoded());
    String id="truyn:node:"+hex(shaBytes(identity.getPublic().getEncoded()));
    var group=new NioEventLoopGroup(1);
    Channel udp=null;QuicChannel channel=null;
    try{
      var ssl=QuicSslContextBuilder.forClient()
        .trustManager(trustedCa)
        .endpointIdentificationAlgorithm("HTTPS")
        .applicationProtocols("truyn/1").build();
      var codec=new QuicClientCodecBuilder().sslContext(ssl)
        .maxIdleTimeout(30,TimeUnit.SECONDS)
        .initialMaxData(10_000_000)
        .initialMaxStreamDataBidirectionalLocal(1_000_000).build();
      udp=new Bootstrap().group(group).channel(NioDatagramChannel.class)
        .handler(codec).bind(0).sync().channel();
      channel=QuicChannel.newBootstrap(udp)
        .streamHandler(new ChannelInboundHandlerAdapter())
        .remoteAddress(new InetSocketAddress(host,port)).connect().get(TIMEOUT,TimeUnit.SECONDS);
      var nonceBytes=new byte[24];new SecureRandom().nextBytes(nonceBytes);
      var nonce=Base64.getUrlEncoder().withoutPadding().encodeToString(nonceBytes);
      var helloBody=m("protocol",SESSION,"kind","HELLO","nodeId",id,
        "transport","quic","endpoints",List.of(),"nonce",nonce,"issuedAt",utc(),
        "protocols",List.of("TRUYN/1"),"semantics",List.of(),"requiredSemantics",List.of());
      var hello=without(helloBody);
      hello.put("publicKey",publicPem);hello.put("signature",sign(identity.getPrivate(),helloBody));
      var response=send(channel,m("kind","session-hello","hello",hello));
      if(!Boolean.TRUE.equals(response.get("ok")))throw new SecurityException("quic_hello_denied:"+response.get("error"));
      var accept=obj(response.get("accept"));
      String peer=require(accept.get("nodeId"),"accept nodeId");
      verify(peer,require(accept.get("publicKey"),"accept public key"),
        require(accept.get("signature"),"accept signature"),without(accept,"publicKey","signature"));
      String hDigest=sha(without(hello,"signature"));
      String binding="quic:hello:"+hDigest;
      if(!SESSION.equals(accept.get("protocol"))||!"ACCEPT".equals(accept.get("kind"))||
        !id.equals(accept.get("peerNodeId"))||!nonce.equals(accept.get("helloNonce"))||
        !hDigest.equals(accept.get("helloDigest"))||!binding.equals(accept.get("transportBinding"))||
        !"quic".equals(accept.get("transport"))||!"TRUYN/1".equals(accept.get("negotiatedProtocol"))||
        !List.of().equals(accept.get("negotiatedSemantics"))||
        !(accept.get("supportedProtocols") instanceof List<?> ps&&ps.contains("TRUYN/1"))||
        !recent(accept.get("issuedAt")))throw new SecurityException("quic_accept_binding_or_version_mismatch");
      if(expectedNodeId!=null&&!expectedNodeId.equals(peer))throw new SecurityException("quic_wrong_signed_peer");
      String sid="truyn:session:"+sha(m("helloNodeId",id,"acceptNodeId",peer,
        "helloNonce",nonce,"acceptNonce",accept.get("nonce"),"transportBinding",binding));
      if(!sid.equals(response.get("sessionId")))throw new SecurityException("quic_session_id_mismatch");
      return new QuicDhtClient(group,udp,channel,identity,id,publicPem,peer,sid);
    }catch(Exception error){
      if(channel!=null)channel.close().syncUninterruptibly();
      if(udp!=null)udp.close().syncUninterruptibly();
      group.shutdownGracefully().syncUninterruptibly();
      throw error;
    }
  }

  private Map<String,Object> rpc(String method,Object payload)throws Exception{
    if(!List.of("dht.ping","dht.find-node","peer.announce","dht.store","dht.find-value").contains(method))
      throw new IllegalArgumentException("unsupported_dht_method");
    var reply=send(channel,m("kind","control","sessionId",sessionId,"method",method,"payload",payload));
    if(!Boolean.TRUE.equals(reply.get("ok")))throw new IllegalStateException("quic_control_denied:"+reply.get("error"));
    return obj(reply.get("result"));
  }
  private static Map<String,Object> checked(Map<String,Object> record,boolean peer){
    String expected=peer?"truyn-peer-record-v1":"truyn-kademlia-v1";
    String field=peer?"nodeId":"publisherNodeId";
    if(!expected.equals(record.get("protocol")))throw new SecurityException("invalid_signed_record_protocol");
    var signed=without(record,"publicKey","signature");
    var body=without(signed,"recordId");
    String prefix=peer?"truyn:peer:":"truyn:dht:";
    if(!(prefix+sha(body)).equals(record.get("recordId")))throw new SecurityException("invalid_signed_record_hash");
    verify(require(record.get(field),"record owner"),require(record.get("publicKey"),"record public key"),
      require(record.get("signature"),"record signature"),signed);
    if(!Instant.parse(require(record.get("expiresAt"),"expiry")).isAfter(Instant.now()))
      throw new SecurityException("signed_record_expired");
    if(peer){
      if(!rawSha(require(record.get("nodeId"),"peer")).equals(record.get("dhtId"))||
        !(record.get("endpoints") instanceof List<?> endpoints&&!endpoints.isEmpty()))
        throw new SecurityException("invalid_peer_record");
    }else{
      String namespace=require(record.get("namespace"),"namespace"),key=require(record.get("key"),"key");
      if(!rawSha(namespace+":"+key).equals(record.get("keyHash"))||
        !("sha256:"+sha(record.get("value"))).equals(record.get("valueDigest")))
        throw new SecurityException("invalid_dht_record_content");
    }
    return record;
  }
  public boolean ping()throws Exception{
    var result=rpc("dht.ping",null);
    if(!Boolean.TRUE.equals(result.get("pong"))||!remoteNodeId.equals(result.get("nodeId")))
      throw new SecurityException("quic_ping_wrong_peer");
    if(result.get("peerRecord")!=null)checked(obj(result.get("peerRecord")),true);
    return true;
  }
  public List<Map<String,Object>> findNode(String target)throws Exception{
    require(target,"targetNodeId");
    var reply=rpc("dht.find-node",m("targetNodeId",target));
    if(!(reply.get("records") instanceof List<?> records)||records.size()>256)
      throw new IllegalStateException("invalid_quic_node_records");
    var out=new ArrayList<Map<String,Object>>();
    for(Object r:records)out.add(checked(obj(r),true));return out;
  }
  public Map<String,Object> announce(List<String> endpoints,long sequence)throws Exception{
    if(endpoints==null||endpoints.isEmpty()||sequence<1)throw new IllegalArgumentException("invalid_announcement");
    var sorted=new ArrayList<>(new TreeSet<>(endpoints));
    var issued=Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var body=m("protocol","truyn-peer-record-v1","nodeId",nodeId,"dhtId",rawSha(nodeId),
      "endpoints",sorted,"capabilities",List.of(),"nat",null,"sequence",sequence,
      "issuedAt",issued.toString(),"expiresAt",issued.plusSeconds(300).toString());
    var signed=without(body);signed.put("recordId","truyn:peer:"+sha(body));
    var record=without(signed);record.put("publicKey",publicPem);
    record.put("signature",sign(identity.getPrivate(),signed));
    var result=rpc("peer.announce",m("record",record));
    if(!Boolean.TRUE.equals(result.get("accepted"))||!nodeId.equals(result.get("nodeId")))
      throw new IllegalStateException("invalid_quic_announcement_receipt");
    return result;
  }
  public Map<String,Object> store(String namespace,String key,Object value,long sequence)throws Exception{
    require(namespace,"namespace");require(key,"key");
    if(sequence<1)throw new IllegalArgumentException("invalid_sequence");
    var issued=Instant.now().truncatedTo(ChronoUnit.MILLIS);
    var body=m("protocol","truyn-kademlia-v1","namespace",namespace,"key",key,
      "keyHash",rawSha(namespace+":"+key),"value",value,"valueDigest","sha256:"+sha(value),
      "publisherNodeId",nodeId,"sequence",sequence,
      "issuedAt",issued.toString(),"expiresAt",issued.plusSeconds(300).toString());
    var signed=without(body);signed.put("recordId","truyn:dht:"+sha(body));
    var record=without(signed);record.put("publicKey",publicPem);
    record.put("signature",sign(identity.getPrivate(),signed));
    var result=rpc("dht.store",m("record",record));
    if(!Boolean.TRUE.equals(result.get("stored"))||!signed.get("recordId").equals(result.get("recordId")))
      throw new IllegalStateException("invalid_quic_store_receipt");
    return result;
  }
  public List<Map<String,Object>> findValue(String namespace,String key)throws Exception{
    require(namespace,"namespace");require(key,"key");
    var reply=rpc("dht.find-value",m("namespace",namespace,"key",key));
    if(!(reply.get("records") instanceof List<?> records)||records.size()>256)
      throw new IllegalStateException("invalid_quic_value_records");
    var result=new ArrayList<Map<String,Object>>();
    for(Object record:records)result.add(checked(obj(record),false));
    return result;
  }
  @Override public void close()throws Exception{
    try{channel.close().sync();}finally{
      try{udp.close().sync();}finally{group.shutdownGracefully().sync();}
    }
  }
}

package org.truyn.sdk;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;

public final class QuicDhtConformanceMain {
 public static void main(String[] args)throws Exception{
  if(args.length!=4)throw new IllegalArgumentException("host port cert expectedNodeId");
  String host=args[0],peer=args[3];
  try(var client=QuicDhtClient.connect(host,Integer.parseInt(args[1]),"localhost",new File(args[2]),peer)){
   if(!client.ping())throw new AssertionError("native Java QUIC PING false");
   if(client.findNode(peer).stream().noneMatch(p->peer.equals(p.get("nodeId"))))
      throw new AssertionError("Java QUIC FIND_NODE missing signed peer");
   var announcement=client.announce(List.of("quic://127.0.0.1:4433"),1);
   if(!Boolean.TRUE.equals(announcement.get("accepted")))throw new AssertionError("Java QUIC ANNOUNCE invalid");
   var stored=client.store("java-native","five-dht-methods",Map.of("language","java","count",5),1);
   if(!Boolean.TRUE.equals(stored.get("stored")))throw new AssertionError("Java signed STORE invalid");
   var records=client.findValue("java-native","five-dht-methods");
   if(records.stream().noneMatch(r->Objects.equals(r.get("recordId"),stored.get("recordId"))))
     throw new AssertionError("Java signed FIND_VALUE invalid");
   try{
    var bad=new LinkedHashMap<>(records.get(0));
    bad.put("value",Map.of("spoof",true));
    var fn=QuicDhtClient.class.getDeclaredMethod("checked",Map.class,boolean.class);
    fn.setAccessible(true);
    fn.invoke(null,bad,false);
    throw new AssertionError("tampered DHT record accepted");
   }catch(java.lang.reflect.InvocationTargetException expected){
    if(!(expected.getCause() instanceof SecurityException))throw expected;
   }
  }
  try(var unexpected=QuicDhtClient.connect(host,Integer.parseInt(args[1]),"localhost",new File(args[2]),
     "truyn:node:"+"0".repeat(64))){
    throw new AssertionError("accepted a foreign QUIC peer");
  }catch(SecurityException ok){}
  System.out.println("TRUYN_NATIVE_JAVA_QUIC_DHT_PASS five_methods=5 TLS=VERIFIED signed_records=VERIFIED");
 }
}

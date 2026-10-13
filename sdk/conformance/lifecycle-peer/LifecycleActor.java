package org.truyn.sdk;
import java.io.*;import java.net.URI;import java.time.Duration;import java.util.*;
public final class LifecycleActor {
 public static void main(String[]args)throws Exception{
  TruynClient peer=null; var input=new BufferedReader(new InputStreamReader(System.in));String line;
  while((line=input.readLine())!=null){
   var a=Json.object(Json.parse(line));Object value=null;
   try{
    String op=(String)a.get("op"),id=(String)a.get("id"),cap=(String)a.get("capability");
    switch(op){
     case "init":{
      var builder=TruynClient.builder().baseUrl(URI.create((String)a.get("url"))).timeout(Duration.ofSeconds(5));
      if(a.containsKey("protocols")){var p=new ArrayList<String>();for(Object v:(List<?>)a.get("protocols"))p.add((String)v);builder.supportedProtocols(p);}
      peer=builder.build();peer.register("lifecycle-fixture");
      var names=new HashSet<String>();for(var m:TruynClient.class.getMethods())names.add(m.getName());
      value=Map.of("nodeId",peer.nodeId(),"cancelSurface","public-cancelNeed","compactApi",names.containsAll(List.of("compactNeed","partial","pollCompact")));break;}
     case "offer":value=peer.offer(cap,Map.of()).join();break;
     case "need":{var r=peer.need(cap,Map.of("fixture",true),Map.of()).join();value=Map.of("needId",r.needId(),"provider",r.provider());break;}
     case "result":value=peer.sendResult(id,Map.of("answer",42),Map.of()).join();break;
     case "cancel":peer.cancelNeed(id,"fixture").join();break;
     case "withdraw":peer.revokeOffer(id).join();break;
     case "next":{var r=peer.nextNeed(Duration.ofSeconds(3)).join();value=Map.of("needId",r.needId(),"verified",true);break;}
     case "wait":{var r=peer.waitForResult(id,Duration.ofSeconds(3)).join();value=Map.of("needId",r.needId(),"verified",true);break;}
     case "close":System.out.println("{\"ok\":true,\"value\":null}");return;
     default:throw new IllegalArgumentException("unsupported_fixture_operation");
    }
    var out=new LinkedHashMap<String,Object>();out.put("ok",true);out.put("value",value);System.out.println(Json.stringify(out));
   }catch(Throwable e){while(e.getCause()!=null)e=e.getCause();System.out.println(Json.stringify(Map.of("ok",false,"message",String.valueOf(e.getMessage()))));}
   System.out.flush();
  }
 }
}

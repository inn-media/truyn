package org.truyn.sdk;
import java.io.*;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
public final class LifecyclePeer {
 // Only public optional methods are invoked. The old public JAR stays intact.
 private static Object compact(TruynClient peer,String method,Class<?>[] types,Object... values)throws Exception{
  Object result=TruynClient.class.getMethod(method,types).invoke(peer,values);
  return result instanceof CompletableFuture<?> f?f.join():result;
 }
 public static void main(String[] args)throws Exception{
  if(args.length!=2)throw new IllegalArgumentException("mode relay");
  var peers=new HashMap<String,TruynClient>();var reader=new BufferedReader(new InputStreamReader(System.in));String line;
  while((line=reader.readLine())!=null){
   Map<String,Object> m=Json.object(Json.parse(line));var out=new LinkedHashMap<String,Object>();out.put("id",m.get("id"));
   try{
    var a=Json.object(m.get("args"));String action=(String)m.get("action"),actor=(String)a.get("actor");var p=peers.get(actor);Object value=null;
    switch(action){
     case "connect"->{
      List<String> protocols=new ArrayList<>();for(Object v:(List<?>)a.getOrDefault("protocols",List.of("TRUYN/1")))protocols.add((String)v);
      p=TruynClient.builder().baseUrl(URI.create(args[1])).supportedProtocols(protocols).timeout(Duration.ofSeconds(5)).build();p.register(actor);peers.put(actor,p);
      var names=new HashSet<String>();for(var method:TruynClient.class.getMethods())names.add(method.getName());
      boolean partial=names.containsAll(List.of("partial","compactNeed","compactResult","pollCompact"));
      value=Map.of("nodeId",p.nodeId(),"cancel",true,"withdraw",true,"partial",partial,"surface","client-api");
     }
     case "offer"->value=p.offer((String)a.get("capability"),a.containsKey("metadata")?Json.object(a.get("metadata")):Map.of()).join();
     case "need"->{var r=p.need((String)a.get("capability"),Map.of("probe",true),Map.of()).join();value=Map.of("needId",r.needId(),"provider",r.provider());}
     case "result"->value=p.sendResult((String)a.get("needId"),Map.of("answer",42),Map.of()).join();
     case "nextNeed"->{var r=p.nextNeed(Duration.ofSeconds(3)).join();value=Map.of("needId",r.needId(),"verified",true);}
     case "waitResult"->{var r=p.waitForResult((String)a.get("needId"),Duration.ofSeconds(3)).join();value=Map.of("needId",r.needId(),"verified",true);}
     case "cancel"->p.cancelNeed((String)a.get("needId"),"test_cancel").join();
     case "withdraw"->p.revokeOffer((String)a.get("offerId")).join();
     case "poll"->{var rows=new ArrayList<Object>();for(var x:p.poll())rows.add(Map.of("kind",x.kind(),"verified",x.verified()));value=rows;}
     case "compactNeed"->value=compact(p,"compactNeed",new Class<?>[]{String.class,Object.class,Map.class},a.get("capability"),Map.of("probe",true),Map.of());
     case "partial"->value=compact(p,"partial",new Class<?>[]{String.class,long.class,Object.class,Map.class},a.get("needId"),((Number)a.get("sequence")).longValue(),a.get("delta"),Map.of());
     case "compactResult"->value=compact(p,"compactResult",new Class<?>[]{String.class,Object.class,Map.class},a.get("needId"),Map.of("answer",42),Map.of());
     case "pollCompact"->{
      var rows=new ArrayList<Object>();for(Object raw:(List<?>)compact(p,"pollCompact",new Class<?>[]{})){
       var event=Json.object(raw);var row=new LinkedHashMap<String,Object>();row.put("kind",event.get("kind"));row.put("verified",Boolean.TRUE.equals(Json.object(event.get("verification")).get("ok")));
       if(event.get("payload") instanceof Map<?,?> payload&&payload.containsKey("sequence"))row.put("sequence",payload.get("sequence"));rows.add(row);
      }value=rows;
     }
     default->throw new IllegalArgumentException("unsupported_action");
    }
    out.put("ok",true);out.put("value",value);
   }catch(Exception e){out.put("ok",false);Throwable cause=e;while(cause.getCause()!=null)cause=cause.getCause();String error=String.valueOf(cause.getMessage());out.put("error",error.substring(0,Math.min(150,error.length())));}
   System.out.println(Json.stringify(out));System.out.flush();
  }
 }
}

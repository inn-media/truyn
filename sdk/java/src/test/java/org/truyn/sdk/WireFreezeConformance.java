package org.truyn.sdk;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
public final class WireFreezeConformance {
  public static void main(String[] args) throws Exception {
    var results=new LinkedHashMap<String,Object>();
    for(Object item:cases("protocol-envelope-golden-fixtures.json")) {
      var c=Json.object(item);var env=Json.object(c.get("envelope"));var unsigned=new LinkedHashMap<>(env);unsigned.remove("signature");
      var check=new LinkedHashMap<String,Object>();boolean ok=TruynClient.verifyEnvelope(env);check.put("ok",ok);if(!ok)check.put("reason","invalid_signature");
      check.put("canonicalUnsignedSha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Json.stringify(unsigned).getBytes(StandardCharsets.UTF_8))));results.put((String)c.get("id"),check);
    }
    for(Object item:cases("envelope-ext-fixtures.json")) {
      var c=Json.object(item);var semantics=((List<?>)c.get("negotiatedSemantics")).stream().map(v->(String)v).toList();
      var check=EnvelopeExtensions.verify(Json.object(c.get("envelope")),semantics,Instant.ofEpochMilli(((Number)c.get("now")).longValue()));results.put((String)c.get("id"),check.asMap());
    }
    var client=TruynClient.builder().baseUrl(java.net.URI.create("http://127.0.0.1:1")).build();
    var payload=Map.<String,Object>of("input",Map.of("query","Bakı 🚀","topK",42,"threshold",0.5));var ext=Map.<String,Object>of("priority","normal");
    boolean blocked=false;try{client.createEnvelopeWithExt("NEED",payload,ext,List.of());}catch(IllegalArgumentException e){blocked=true;}
    var emitted=client.createEnvelopeWithExt("NEED",payload,ext,List.of(EnvelopeExtensions.SEMANTIC));
    System.out.println("WIRE_FREEZE_RESULT "+Json.stringify(Map.of("language","java","results",results,"emitted",emitted,"emissionBlocked",blocked)));
  }
  private static List<?> cases(String name)throws Exception {return (List<?>)Json.object(Json.parse(Files.readString(Path.of("sdk/conformance/v1/"+name)))).get("cases");}
}

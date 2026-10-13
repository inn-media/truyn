package org.truyn.sdk;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/** Negotiated metadata, checked after the SDK's native Ed25519 verifier. */
public final class EnvelopeExtensions {
  public static final String SEMANTIC = "truyn.envelope.ext/1";
  private static final Set<String> KNOWN = Set.of("traceId","expiresAt","priority","contentType","crit");
  private EnvelopeExtensions() {}
  public record Check(boolean ok, String reason, String detail) {
    public Map<String,Object> asMap() { var result=new LinkedHashMap<String,Object>(); result.put("ok",ok); if(reason!=null)result.put("reason",reason);if(detail!=null)result.put("detail",detail);return result; }
  }
  private static Check fail(String reason,String detail){return new Check(false,reason,detail);}
  private static boolean matches(Object value,String pattern){return value instanceof String s && s.matches(pattern);}
  public static Check verify(Map<String,Object> envelope,List<String> negotiatedSemantics,Instant now) {
    if(!TruynClient.verifyEnvelope(envelope))return fail("invalid_signature",null);
    return validate(envelope,negotiatedSemantics,now);
  }
  /** The caller supplies the authenticated agreement, never an envelope advertisement. */
  public static Check validate(Map<String,Object> envelope,List<String> negotiatedSemantics,Instant now) {
    if(!negotiatedSemantics.contains(SEMANTIC)||!envelope.containsKey("ext"))return new Check(true,null,null);
    if(!(envelope.get("ext") instanceof Map<?,?> ext)||ext.size()>16)return fail("invalid_argument","invalid_ext");
    for(var entry:ext.entrySet()) {
      if(!matches(entry.getKey(),"[A-Za-z][A-Za-z0-9]{0,31}"))return fail("invalid_argument","invalid_ext");
      String key=(String)entry.getKey(); Object value=entry.getValue();
      if(key.equals("crit")) {
        if(!(value instanceof List<?> list)||list.size()>16||new HashSet<>(list).size()!=list.size())return fail("invalid_argument","invalid_ext:crit");
        for(Object k:list)if(!matches(k,"[A-Za-z][A-Za-z0-9]{0,31}")||k.equals("crit")||!ext.containsKey(k))return fail("invalid_argument","invalid_ext:crit");
      } else if(!matches(value,"[A-Za-z0-9._:;=/+\\-]{1,128}"))return fail("invalid_argument","invalid_ext:"+key);
    }
    if(Json.stringify(ext).getBytes(StandardCharsets.UTF_8).length>1024)return fail("invalid_argument","invalid_ext");
    if(ext.containsKey("traceId")&&(!matches(ext.get("traceId"),"[0-9a-f]{32}")||ext.get("traceId").equals("0".repeat(32))))return fail("invalid_argument","invalid_ext:traceId");
    Instant expires=null;
    if(ext.containsKey("expiresAt")) {
      try {
        String s=(String)ext.get("expiresAt");
        if(!s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z"))return fail("invalid_argument","invalid_ext:expiresAt");
        // ISO_LOCAL_DATE_TIME uses strict calendar validation (Instant accepts leap seconds).
        var date=java.time.LocalDateTime.parse(s.substring(0,s.length()-1));
        expires=date.toInstant(java.time.ZoneOffset.UTC);
        if(!expires.isAfter(Instant.parse((String)envelope.get("createdAt"))))return fail("invalid_argument","invalid_ext:expiresAt");
      }catch(Exception e){return fail("invalid_argument","invalid_ext:expiresAt");}
    }
    if(ext.containsKey("priority")&&!List.of("background","normal","critical").contains(ext.get("priority")))return fail("invalid_argument","invalid_ext:priority");
    if(ext.containsKey("contentType")&&!matches(ext.get("contentType"),"application/json(?:;profile=[a-z0-9][a-z0-9._/\\-]{0,95})?"))return fail("invalid_argument","invalid_ext:contentType");
    if(ext.get("crit") instanceof List<?> crit)for(Object key:crit)if(!KNOWN.contains(key))return fail("version_mismatch","required_semantic_unavailable:"+key);
    if(now==null)now=Instant.now();
    if(expires!=null&&now.isAfter(expires.plusSeconds(30)))return fail("deadline_exceeded","envelope_expired");
    if(ext.containsKey("contentType")&&!List.of("application/json","application/json;profile=truyn."+((String)envelope.get("type")).toLowerCase(Locale.ROOT)+"/1").contains(ext.get("contentType")))return fail("unimplemented","unsupported_content_type");
    return new Check(true,null,null);
  }
}

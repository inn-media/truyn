package org.truyn.sdk;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Native Agent Descriptor retrieval, identity-key verification and interface negotiation. */
public final class AgentDescriptors {
  private AgentDescriptors() {}

  public record Selection(String descriptorVersion, String protocol, Map<String,Object> interfaceValue) {}
  public record Signer(String identity, String keyBinding) {}
  public record Verified(TruynModels.AgentDescriptor descriptor, Selection selection, Signer signer) {}

  public static Verified fetch(URI uri, String publicKeyPem) {
    return fetch(uri, publicKeyPem, List.of("TRUYN/1"), List.of("https", "websocket", "truyn-quic", "mcp"));
  }

  public static Verified fetch(URI uri, String publicKeyPem, List<String> supportedProtocols, List<String> supportedInterfaces) {
    if (uri == null || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null)
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, "Agent Descriptor URL must be absolute HTTP(S)", false);
    try {
      var response = HttpClient.newHttpClient().send(
          HttpRequest.newBuilder(uri).header("accept", "application/json").GET().build(),
          HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (response.statusCode() < 200 || response.statusCode() >= 300)
        throw new TruynException(TruynException.Code.INVALID_RESPONSE, "Descriptor HTTP " + response.statusCode(), false);
      Map<String,Object> raw = Json.object(Json.parse(response.body()));
      validate(raw);
      verify(raw, publicKeyPem);
      String protocol = selectProtocol(raw, supportedProtocols);
      Map<String,Object> interfaceValue = selectInterface(raw, supportedInterfaces);
      return new Verified(model(raw), new Selection("1", protocol, interfaceValue), new Signer((String) raw.get("identity"), "identity"));
    } catch (TruynException error) {
      throw error;
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new TruynException(TruynException.Code.CANCELLED, "Agent Descriptor request cancelled", false);
    } catch (Exception error) {
      throw new TruynException(TruynException.Code.TRANSPORT, error.getMessage(), true);
    }
  }

  private static void validate(Map<String,Object> raw) {
    if (!"truyn.agent-descriptor/v1".equals(raw.get("schema")) || !"1".equals(raw.get("descriptorVersion")))
      throw new TruynException(TruynException.Code.VERSION_MISMATCH, "unsupported Agent Descriptor schema/version", false);
    String identity = text(raw.get("identity"));
    if (identity == null || !identity.startsWith("truyn:node:"))
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, "invalid Agent Descriptor identity", false);
    List<?> protocols = list(raw.get("protocols"));
    List<?> interfaces = list(raw.get("interfaces"));
    if (protocols.isEmpty() || interfaces.isEmpty() || !(raw.get("capabilities") instanceof List<?>))
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, "invalid Agent Descriptor discovery fields", false);
    Instant issued = instant(raw.get("issuedAt"));
    Instant expires = instant(raw.get("expiresAt"));
    if (issued == null || expires == null || !expires.isAfter(issued))
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, "invalid Agent Descriptor expiry window", false);
    if (!expires.isAfter(Instant.now()))
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, "Agent Descriptor has expired", false);
    if (signatures(raw).isEmpty())
      throw new TruynException(TruynException.Code.UNAUTHENTICATED, "Agent Descriptor signature is required", false);
  }

  private static void verify(Map<String,Object> raw, String publicKeyPem) throws Exception {
    if (publicKeyPem == null || publicKeyPem.isBlank())
      throw new TruynException(TruynException.Code.UNAUTHENTICATED, "Agent Descriptor identity public key is required", false);
    byte[] der = decodePem(publicKeyPem);
    String resolved = "truyn:node:" + hex(MessageDigest.getInstance("SHA-256").digest(der));
    if (!resolved.equals(raw.get("identity")))
      throw new TruynException(TruynException.Code.UNAUTHENTICATED, "Agent Descriptor identity key mismatch", false);
    var publicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(der));
    Map<String,Object> unsigned = new LinkedHashMap<>(raw);
    unsigned.remove("signature"); unsigned.remove("signatures");
    byte[] payload = Json.stringify(unsigned).getBytes(StandardCharsets.UTF_8);
    for (String encoded : signatures(raw)) {
      try {
        byte[] signatureBytes = Base64.getDecoder().decode(encoded);
        if (signatureBytes.length != 64) continue;
        Signature verifier = Signature.getInstance("Ed25519"); verifier.initVerify(publicKey); verifier.update(payload);
        if (verifier.verify(signatureBytes)) return;
      } catch (IllegalArgumentException ignored) {}
    }
    throw new TruynException(TruynException.Code.UNAUTHENTICATED, "Agent Descriptor signature verification failed", false);
  }

  private static String selectProtocol(Map<String,Object> raw, List<String> supported) {
    List<?> advertised = list(raw.get("protocols"));
    for (String candidate : supported) if (advertised.contains(candidate)) return candidate;
    throw new TruynException(TruynException.Code.VERSION_MISMATCH, "no mutually supported TRUYN protocol", false);
  }

  private static Map<String,Object> selectInterface(Map<String,Object> raw, List<String> supported) {
    for (Object value : list(raw.get("interfaces"))) {
      Map<String,Object> candidate = Json.object(value);
      if (supported.contains(text(candidate.get("type")))) return candidate;
    }
    throw new TruynException(TruynException.Code.VERSION_MISMATCH, "no mutually supported Agent Descriptor interface", false);
  }

  private static TruynModels.AgentDescriptor model(Map<String,Object> raw) {
    List<String> protocols = new ArrayList<>(); for (Object value : list(raw.get("protocols"))) protocols.add(String.valueOf(value));
    List<TruynModels.Interface> interfaces = new ArrayList<>();
    for (Object value : list(raw.get("interfaces"))) { Map<String,Object> item=Json.object(value); interfaces.add(new TruynModels.Interface(text(item.get("type")), text(item.get("endpoint")))); }
    List<TruynModels.Capability> capabilities = new ArrayList<>();
    for (Object value : list(raw.get("capabilities"))) { Map<String,Object> item=Json.object(value); capabilities.add(new TruynModels.Capability(text(item.get("id")), text(item.get("name")))); }
    return new TruynModels.AgentDescriptor((String)raw.get("schema"),(String)raw.get("descriptorVersion"),(String)raw.get("identity"),List.copyOf(protocols),List.copyOf(interfaces),List.copyOf(capabilities),(String)raw.get("issuedAt"),(String)raw.get("expiresAt"),text(raw.get("signature")),List.of());
  }

  private static List<String> signatures(Map<String,Object> raw) {
    List<String> out = new ArrayList<>(); String single=text(raw.get("signature")); if(single!=null)out.add(single);
    if(raw.get("signatures") instanceof List<?> values) for(Object value:values){ if(value instanceof String text&&!text.isBlank())out.add(text); else if(value instanceof Map<?,?> map){String item=text(map.get("value"));if(item!=null)out.add(item);} }
    return out;
  }
  private static Instant instant(Object value){try{return value instanceof String text?Instant.parse(text):null;}catch(Exception ignored){return null;}}
  private static List<?> list(Object value){return value instanceof List<?> list?list:List.of();}
  private static String text(Object value){return value instanceof String text&&!text.isBlank()?text:null;}
  private static byte[] decodePem(String pem){return Base64.getDecoder().decode(pem.replaceAll("-----BEGIN [^-]+-----","").replaceAll("-----END [^-]+-----","").replaceAll("\\s",""));}
  private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format("%02x",b));return out.toString();}
}

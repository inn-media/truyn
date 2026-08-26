package org.truyn.sdk;

import java.util.List;
import java.util.Map;

/** Language-neutral DTO names mirrored from the shared SDK conformance contract. */
public final class TruynModels {
  private TruynModels() {}

  public record Identity(String nodeId, String publicKey) {}

  public record AgentDescriptor(
      String schema,
      String descriptorVersion,
      String identity,
      List<String> protocols,
      List<Interface> interfaces,
      List<Capability> capabilities,
      String issuedAt,
      String expiresAt,
      String signature,
      List<Signature> signatures) {}

  public record Interface(String type, String url) {}

  public record Signature(String alg, String value, String createdAt) {}

  public record Capability(String id, String name) {}

  public record SignedEnvelope<T>(
      String protocol,
      String type,
      String id,
      String from,
      String to,
      String createdAt,
      String publicKey,
      T payload,
      String signature) {}

  public record OfferPayload(Capability capability, Map<String, Object> metadata) {}

  public record NeedPayload(Capability capability, Object input, Map<String, Object> policy) {}

  public record ResultPayload(
      String requestId,
      Object output,
      String completedAt,
      Map<String, Object> metadata) {}

  public record ArtifactRef(String value) {}

  public record NormalizedError(
      TruynException.Code code,
      String message,
      boolean retryable,
      Map<String, Object> source) {}

  public record Offer(
      String protocol,
      String type,
      String id,
      String from,
      String to,
      String createdAt,
      String publicKey,
      OfferPayload payload,
      String signature) {}

  public record Need(
      String protocol,
      String type,
      String id,
      String from,
      String to,
      String createdAt,
      String publicKey,
      NeedPayload payload,
      String signature) {}

  public record Result(
      String protocol,
      String type,
      String id,
      String from,
      String to,
      String createdAt,
      String publicKey,
      ResultPayload payload,
      String signature) {}
}

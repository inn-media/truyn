package org.truyn.sdk;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Language-neutral DTO names mirrored from the shared SDK conformance contract. */
public final class TruynModels {
  public static final String STABLE_SDK_API_VERSION = "1";
  private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");

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

  public record ObjectPayload(String kind, Object value, Map<String, Object> metadata) {
    public ObjectPayload(Object value, Map<String, Object> metadata) {
      this("object", value, metadata);
    }
  }

  /** Reference-only artifact payload. Binary/base64 data is intentionally absent. */
  public record ArtifactPayload(
      String kind,
      String ref,
      String mediaType,
      Long bytes,
      String sha256,
      Map<String, Object> metadata) {
    public ArtifactPayload {
      if (!"artifact".equals(kind)) throw new IllegalArgumentException("artifact kind must be artifact");
      ref = requireText(ref, "artifact ref");
      mediaType = requireText(mediaType, "artifact media type");
      bytes = requireBytes(bytes);
      sha256 = requireSha256(sha256);
    }

    public ArtifactPayload(String ref, String mediaType, Long bytes, String sha256, Map<String, Object> metadata) {
      this("artifact", ref, mediaType, bytes, sha256, metadata);
    }
  }

  public record StreamItem<T>(long sequence, T item) {
    public StreamItem {
      if (sequence < 0) throw new IllegalArgumentException("stream sequence must be non-negative");
    }
  }

  private static String requireText(String value, String field) {
    if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " is required");
    return value;
  }

  private static Long requireBytes(Long value) {
    if (value != null && value < 0) throw new IllegalArgumentException("artifact bytes must be non-negative");
    return value;
  }

  private static String requireSha256(String value) {
    if (value != null && !SHA256.matcher(value).matches()) {
      throw new IllegalArgumentException("artifact sha256 must be 64 hexadecimal characters");
    }
    return value == null ? null : value.toLowerCase();
  }

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

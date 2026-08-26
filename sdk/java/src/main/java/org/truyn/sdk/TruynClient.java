package org.truyn.sdk;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;

/** Java client skeleton for the stable TRUYN/1 SDK surface. */
public final class TruynClient {
  public static final String PROTOCOL = "TRUYN/1";
  public static final String AGENT_DESCRIPTOR_SCHEMA = "truyn.agent-descriptor/v1";

  private final Config config;

  private TruynClient(Config config) {
    this.config = config;
  }

  public static Builder builder() {
    return new Builder();
  }

  public Config config() {
    return config;
  }

  public CompletableFuture<TruynModels.Identity> identity() {
    return failed("identity");
  }

  public CompletableFuture<TruynModels.AgentDescriptor> agentDescriptor(URI url) {
    Objects.requireNonNull(url, "descriptor URL is required");
    return failed("agentDescriptor");
  }

  public CompletableFuture<List<TruynModels.Offer>> discover(String capability) {
    requireNonBlank(capability, "capability is required");
    return failed("discover");
  }

  public CompletableFuture<TruynModels.Offer> publishOffer(TruynModels.Offer offer) {
    Objects.requireNonNull(offer, "offer is required");
    return failed("publishOffer");
  }

  public CompletableFuture<Void> revokeOffer(String offerId) {
    requireNonBlank(offerId, "offer ID is required");
    return failed("revokeOffer");
  }

  public CompletableFuture<TruynModels.Need> submitNeed(TruynModels.Need need) {
    Objects.requireNonNull(need, "need is required");
    return failed("submitNeed");
  }

  public CompletableFuture<TruynModels.ResultResponse> submitNeed(TruynModels.NeedRequest request) {
    Objects.requireNonNull(request, "need request is required");
    requireNonBlank(request.capability(), "capability is required");
    return failed("submitNeedRequest");
  }

  public CompletableFuture<TruynModels.Result> result(String needId) {
    requireNonBlank(needId, "need ID is required");
    return failed("result");
  }

  public Flow.Publisher<TruynModels.StreamEvent> streamResult(String needId) {
    requireNonBlank(needId, "need ID is required");
    return subscriber -> subscriber.onError(new TruynException(
        TruynException.Code.UNIMPLEMENTED,
        "streamResult is not implemented in the Java SDK skeleton",
        false));
  }

  public CompletableFuture<Void> cancel(String requestId) {
    requireNonBlank(requestId, "request ID is required");
    return failed("cancel");
  }

  private static <T> CompletableFuture<T> failed(String operation) {
    return CompletableFuture.failedFuture(
        new TruynException(
            TruynException.Code.UNIMPLEMENTED,
            operation + " is not implemented in the Java SDK skeleton",
            false));
  }

  private static void requireNonBlank(String value, String message) {
    if (value == null || value.isBlank()) {
      throw new TruynException(TruynException.Code.INVALID_ARGUMENT, message, false);
    }
  }

  public record Config(
      URI baseUrl,
      Optional<String> authToken,
      List<String> supportedProtocols,
      Duration timeout) {}

  public static final class Builder {
    private URI baseUrl;
    private String authToken;
    private List<String> supportedProtocols = List.of(PROTOCOL);
    private Duration timeout = Duration.ofSeconds(30);

    public Builder baseUrl(URI baseUrl) {
      this.baseUrl = baseUrl;
      return this;
    }

    public Builder authToken(String authToken) {
      this.authToken = authToken;
      return this;
    }

    public Builder supportedProtocols(List<String> supportedProtocols) {
      this.supportedProtocols = List.copyOf(Objects.requireNonNull(supportedProtocols));
      return this;
    }

    public Builder timeout(Duration timeout) {
      this.timeout = Objects.requireNonNull(timeout);
      return this;
    }

    public TruynClient build() {
      Objects.requireNonNull(baseUrl, "base URL is required");
      return new TruynClient(new Config(
          baseUrl,
          Optional.ofNullable(authToken),
          List.copyOf(supportedProtocols),
          timeout));
    }
  }
}
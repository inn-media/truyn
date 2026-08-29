package org.truyn.sdk;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

public final class ConformanceMain {
  public static void main(String[] args) {
    if (args.length != 1) throw new IllegalArgumentException("relay URL is required");
    URI relay = URI.create(args[0]);
    TruynClient provider = TruynClient.connect(relay, "java-provider");
    TruynClient requester = TruynClient.connect(relay, "java-requester");
    String capability = "sdk.release.java." + UUID.randomUUID();
    provider.offer(capability, Map.of("language", "java")).join();
    TruynClient.NeedReceipt receipt = requester.need(capability, Map.of("question", "hello"), Map.of()).join();
    TruynClient.NeedEvent need = provider.nextNeed(Duration.ofSeconds(5)).join();
    if (!receipt.needId().equals(need.needId()) || !requester.nodeId().equals(need.requester()) || !capability.equals(need.capability())) throw new AssertionError("invalid NEED correlation");
    provider.sendResult(need.needId(), Map.of("ok", true, "language", "java"), Map.of()).join();
    TruynClient.ResultEvent result = requester.waitForResult(receipt.needId(), Duration.ofSeconds(5)).join();
    if (!provider.nodeId().equals(result.provider())) throw new AssertionError("invalid RESULT provider");
    TruynClient.NeedReceipt cancelReceipt = requester.need(capability, Map.of("cancel", true), Map.of()).join();
    requester.cancelNeed(cancelReceipt.needId(), "sdk_conformance_cancel").join();
    System.out.println("PASS java developer-release conformance");
  }
}

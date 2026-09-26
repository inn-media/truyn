package org.truyn.sdk;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class ConformanceMain {
  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("relay URL is required");
    assertSharedEndpointFixtures();
    URI relay = URI.create(args[0]);
    String descriptorUrl = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_URL");
    String descriptorPublicKey = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY");
    String descriptorIdentity = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY");
    if (descriptorUrl == null || descriptorPublicKey == null || descriptorIdentity == null) throw new IllegalArgumentException("descriptor conformance fixture is required");
    AgentDescriptors.Verified descriptor = AgentDescriptors.fetch(URI.create(descriptorUrl), descriptorPublicKey);
    if (!descriptorIdentity.equals(descriptor.descriptor().identity()) || !"TRUYN/1".equals(descriptor.selection().protocol()) || !"https".equals(descriptor.selection().interfaceValue().get("type")) || !"identity".equals(descriptor.signer().keyBinding())) throw new AssertionError("invalid Agent Descriptor verification");

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

  private static void assertSharedEndpointFixtures() throws Exception {
    Set<String> required = Set.of("descriptor.interface-endpoint-missing", "descriptor.interface-endpoint-blank", "descriptor.interface-type-blank");
    Map<String,Object> fixture = Json.object(Json.parse(Files.readString(Path.of("sdk/conformance/v1/agent-descriptor-runtime-fixtures.json"))));
    List<?> cases = fixture.get("descriptorRuntimeCases") instanceof List<?> values ? values : List.of();
    int checked = 0;
    for (Object value : cases) {
      Map<String,Object> testCase = Json.object(value);
      if (!required.contains(testCase.get("id"))) continue;
      checked++;
      try {
        AgentDescriptors.validateForConformance(Json.object(testCase.get("value")));
        throw new AssertionError("Java accepted invalid shared descriptor fixture " + testCase.get("id"));
      } catch (TruynException expected) {
        if (expected.code() != TruynException.Code.INVALID_ARGUMENT || !expected.getMessage().contains("interfaces require non-empty type and endpoint"))
          throw new AssertionError("Java rejected shared descriptor fixture for the wrong reason " + testCase.get("id"), expected);
      }
    }
    if (checked != required.size()) throw new AssertionError("missing shared endpoint parity fixtures: checked=" + checked);
  }
}

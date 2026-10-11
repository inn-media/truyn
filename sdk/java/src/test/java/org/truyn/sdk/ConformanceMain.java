package org.truyn.sdk;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

public final class ConformanceMain {
  public static void main(String[] args) {
    if (args.length != 1) throw new IllegalArgumentException("relay URL is required");
    URI relay = URI.create(args[0]);
    String descriptorUrl = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_URL");
    String descriptorPublicKey = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY");
    String descriptorIdentity = System.getenv("TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY");
    if (descriptorUrl == null || descriptorPublicKey == null || descriptorIdentity == null) throw new IllegalArgumentException("descriptor conformance fixture is required");
    AgentDescriptors.Verified descriptor = AgentDescriptors.fetch(URI.create(descriptorUrl), descriptorPublicKey);
    if (!descriptorIdentity.equals(descriptor.descriptor().identity()) || !"TRUYN/1".equals(descriptor.selection().protocol()) || !"https".equals(descriptor.selection().interfaceValue().get("type")) || !"identity".equals(descriptor.signer().keyBinding())) throw new AssertionError("invalid Agent Descriptor verification");

    Map<String, Object> tcj = Map.of("n", 1, "q", "R&D <b>");
    if (!"{\"n\":1,\"q\":\"R&D <b>\"}".equals(Json.stringify(tcj))) throw new AssertionError("TCJ1 integer/HTML byte mismatch");
    if (!"{\"n\":0}".equals(Json.stringify(Map.of("n", -0.0d)))) throw new AssertionError("TCJ1 negative-zero byte mismatch");
    if (!"{\"n\":1e+21}".equals(Json.stringify(Map.of("n", 1e21d)))) throw new AssertionError("TCJ1 float exponent byte mismatch");

    try {
      String fixture = java.nio.file.Files.readString(java.nio.file.Path.of("sdk/conformance/v1/tcj1-wire-freeze-vectors.json"));
      Map<String,Object> corpus = Json.object(Json.parse(fixture));
      @SuppressWarnings("unchecked") var vectors = (java.util.List<Object>) corpus.get("cases");
      if (vectors.size() < 14) throw new AssertionError("shared TCJ1 corpus incomplete");
      for (Object entry : vectors) {
        Map<String,Object> vector = Json.object(entry);
        String actual = Json.stringify(vector.get("input"));
        String expected = (String) vector.get("canonicalUnsigned");
        if (!actual.equals(expected)) throw new AssertionError("TCJ1 shared vector " + vector.get("id") + ": " + actual + " != " + expected);
      }
    } catch (java.io.IOException error) { throw new RuntimeException("could not read TCJ1 corpus", error); }

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
    var durable = requester.recoverDurable(32).join();
    if(durable.stream().noneMatch(x -> ("result:"+receipt.needId()).equals(x.get("eventId"))))throw new AssertionError("missing durable result");
    requester.acknowledgeDurable("result:"+receipt.needId()).join();
    if(requester.recoverDurable(32).join().stream().anyMatch(x -> ("result:"+receipt.needId()).equals(x.get("eventId"))))throw new AssertionError("ACKed result replayed");
    TruynClient.NeedReceipt cancelReceipt = requester.need(capability, Map.of("cancel", true), Map.of()).join();
    requester.cancelNeed(cancelReceipt.needId(), "sdk_conformance_cancel").join();
    System.out.println("PASS java developer-release conformance");
  }
}

#pragma warning disable CA2252
using System;
using System.Linq;
using System.Net;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Truyn.Sdk;

internal static class QuicDhtConformance
{
    public static async Task RunAsync(string host, int port, string certificatePath, string peerNodeId)
    {
        using var pin = new X509Certificate2(System.IO.File.ReadAllBytes(certificatePath));
        await using var client = await QuicDhtClient.ConnectAsync(host,port,host,peerNodeId,pin);
        if (!await client.PingAsync()) throw new InvalidOperationException("real QUIC PING failed");
        var records = await client.FindNodeAsync(peerNodeId);
        if (!records.Any(e=>e.GetProperty("nodeId").GetString()==peerNodeId))
            throw new InvalidOperationException("signed QUIC FIND_NODE failed");
        var announced = await client.AnnounceAsync(new [] { "quic://127.0.0.1:4433" });
        if (announced.GetProperty("nodeId").GetString()!=client.NodeId)
            throw new InvalidOperationException("signed QUIC ANNOUNCE failed");
        var value = new { proof = "native-csharp-quic", version = 1 };
        var stored = await client.StoreAsync("sdk-quic","native-five-rpc",value);
        if (stored.GetProperty("stored").ValueKind != JsonValueKind.True)
            throw new InvalidOperationException("signed QUIC DHT STORE failed");
        var fetched = await client.FindValueAsync("sdk-quic","native-five-rpc");
        if (!fetched.Any(e=>e.GetProperty("recordId").GetString()==stored.GetProperty("recordId").GetString()))
            throw new InvalidOperationException("signed QUIC FIND_VALUE digest verification failed");

        // A legitimate TLS server presenting a different Node identity MUST fail,
        // even with a pinned trusted certificate.
        try {
            await using var spoof = await QuicDhtClient.ConnectAsync(host,port,host,
                "truyn:node:" + new string('0',64),pin);
            throw new InvalidOperationException("accepted wrong QUIC Node ID");
        } catch (AuthenticationException) { }

        // The SDK independently verifies DHT record signature, key hash,
        // content digest and immutable record ID; corrupting signed data must fail.
        var tampered = JsonSerializer.SerializeToElement(new {
            recordId=stored.GetProperty("recordId").GetString(),
            protocol="truyn-kademlia-v1", @namespace="sdk-quic", key="native-five-rpc",
            keyHash="wrong-hash", value, valueDigest="sha256:wrong-digest",
            publisherNodeId=client.NodeId, publicKey="bad", signature="bad",
            issuedAt="2026-10-14T00:00:00.000Z", expiresAt="2026-10-15T00:00:00.000Z"
        });
        var verifier=typeof(QuicDhtClient).GetMethod("VerifyDht",
            System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)
            ?? throw new InvalidOperationException("missing signed record verifier");
        try {
            verifier.Invoke(null,new object[]{tampered});
            throw new InvalidOperationException("accepted tampered signed DHT record");
        } catch (System.Reflection.TargetInvocationException e)
            when(e.InnerException is AuthenticationException) { }
        Console.WriteLine("TRUYN_NATIVE_DOTNET_QUIC_DHT_PASS five_methods=5 negative_identity=PASS negative_signature=PASS");
    }
}

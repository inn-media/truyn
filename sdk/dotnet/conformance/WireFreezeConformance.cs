using Truyn.Sdk;
using System.Text.Json;
using System.Security.Cryptography;

internal static class WireFreezeConformance
{
    public static void Run()
    {
        var results = new Dictionary<string, object?>();
        var canonicalType = typeof(TruynClient).Assembly.GetType("Truyn.Sdk.CanonicalJson", true)!;
        var serialize = canonicalType.GetMethod("Serialize", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public)!;
        using var golden = JsonDocument.Parse(File.ReadAllText("sdk/conformance/v1/protocol-envelope-golden-fixtures.json"));
        foreach (var c in golden.RootElement.GetProperty("cases").EnumerateArray())
        {
            var env = c.GetProperty("envelope"); var unsigned = new Dictionary<string, object?>();
            foreach (var property in env.EnumerateObject()) if (property.Name != "signature") unsigned[property.Name] = property.Value.Clone();
            var bytes = (byte[])serialize.Invoke(null, new object?[] { unsigned })!;
            var check = new Dictionary<string, object?> { ["ok"] = TruynClient.VerifyEnvelope(env), ["canonicalUnsignedSha256"] = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant() };
            if (!(bool)check["ok"]!) check["reason"] = "invalid_signature";
            results[c.GetProperty("id").GetString()!] = check;
        }
        using var negatives = JsonDocument.Parse(File.ReadAllText("sdk/conformance/v1/envelope-ext-fixtures.json"));
        foreach (var c in negatives.RootElement.GetProperty("cases").EnumerateArray())
        {
            var semantics = c.GetProperty("negotiatedSemantics").EnumerateArray().Select(x => x.GetString()!).ToArray();
            var check = EnvelopeExtensions.Verify(c.GetProperty("envelope"), semantics, DateTimeOffset.FromUnixTimeMilliseconds(c.GetProperty("now").GetInt64()));
            var output = new Dictionary<string, object?> { ["ok"] = check.Ok };
            if (check.Reason is not null) output["reason"] = check.Reason;
            if (check.Detail is not null) output["detail"] = check.Detail;
            results[c.GetProperty("id").GetString()!] = output;
        }
        var client = new TruynClient(new TruynClientOptions(new Uri("http://127.0.0.1:1")));
        var payload = new { input = new { query = "Bakı 🚀", topK = 42, threshold = 0.5 } }; var ext = new { priority = "normal" };
        bool emissionBlocked = false; try { client.CreateEnvelopeWithExt("NEED", payload, ext, Array.Empty<string>()); } catch (ArgumentException) { emissionBlocked = true; }
        var emitted = client.CreateEnvelopeWithExt("NEED", payload, ext, new[] { EnvelopeExtensions.Semantic });
        client.DisposeAsync().AsTask().GetAwaiter().GetResult();
        Console.WriteLine("WIRE_FREEZE_RESULT " + JsonSerializer.Serialize(new { language = "dotnet", results, emitted, emissionBlocked }));
    }
}

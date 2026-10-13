using Truyn.Sdk;

if (args.Length == 1 && args[0] == "--wire-freeze") { WireFreezeConformance.Run(); return; }

if (args.Length == 1 && args[0] == "--descriptor-interfaces") { await DescriptorInterfaceConformance.RunAsync(); return; }

if (args.Length != 1) throw new ArgumentException("relay URL is required");
var relay = new Uri(args[0]);
var descriptorUrl = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_URL");
var descriptorPublicKey = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY");
var descriptorIdentity = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY");
if (string.IsNullOrWhiteSpace(descriptorUrl) || string.IsNullOrWhiteSpace(descriptorPublicKey) || string.IsNullOrWhiteSpace(descriptorIdentity)) throw new ArgumentException("descriptor conformance fixture is required");
var descriptor = await AgentDescriptors.FetchAsync(new Uri(descriptorUrl), descriptorPublicKey);
if (descriptor.Descriptor.Identity != descriptorIdentity || descriptor.Selection.Protocol != "TRUYN/1" || descriptor.Selection.Interface.GetProperty("type").GetString() != "https" || descriptor.Signer.KeyBinding != "identity") throw new InvalidOperationException("invalid Agent Descriptor verification");

// TCJ1 byte conformance probes use reflection solely to keep the production
// canonicalizer internal; no public SDK API change or alternate signer.
var canonicalType = typeof(TruynClient).Assembly.GetType("Truyn.Sdk.CanonicalJson", throwOnError: true)!;
var canonicalMethod = canonicalType.GetMethod("Serialize", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public)!;
void AssertCanonical(object input, string expected)
{
    var actual = (byte[])canonicalMethod.Invoke(null, new object?[] {input})!;
    if (!actual.AsSpan().SequenceEqual(System.Text.Encoding.UTF8.GetBytes(expected)))
        throw new InvalidOperationException("dotnet TCJ1 byte mismatch: " + System.Text.Encoding.UTF8.GetString(actual) + " vs " + expected);
}
AssertCanonical(new Dictionary<string, object> {["n"] = -0.0}, "{\"n\":0}");
AssertCanonical(new Dictionary<string, object> {["n"] = 1e21}, "{\"n\":1e+21}");
AssertCanonical(new Dictionary<string, object> {["n"] = 1e-7}, "{\"n\":1e-7}");
AssertCanonical(new Dictionary<string, object> {["n"] = 0.000025}, "{\"n\":0.000025}");
AssertCanonical(new Dictionary<string, object> {["q"] = "R&D <b>"}, "{\"q\":\"R&D <b>\"}");

var sharedCorpusPath = "sdk/conformance/v1/tcj1-wire-freeze-vectors.json";
using (var golden = System.Text.Json.JsonDocument.Parse(System.IO.File.ReadAllText(sharedCorpusPath)))
{
    var cases = golden.RootElement.GetProperty("cases");
    if (cases.GetArrayLength() < 14) throw new InvalidOperationException("shared TCJ1 corpus incomplete");
    foreach (var item in cases.EnumerateArray())
    {
        var actual = (byte[])canonicalMethod.Invoke(null, new object?[] {item.GetProperty("input")})!;
        var expected = System.Text.Encoding.UTF8.GetBytes(item.GetProperty("canonicalUnsigned").GetString()!);
        if (!actual.AsSpan().SequenceEqual(expected))
            throw new InvalidOperationException("dotnet TCJ1 shared vector " + item.GetProperty("id").GetString() + " byte mismatch: " + System.Text.Encoding.UTF8.GetString(actual));
    }
}

using (var p10 = System.Text.Json.JsonDocument.Parse(System.IO.File.ReadAllText("sdk/conformance/v1/p10-error-mapping.json")))
{
    foreach (var item in p10.RootElement.GetProperty("cases").EnumerateArray())
    {
        var source = item.GetProperty("source");
        var code = source.TryGetProperty("relayCode", out var raw) ? raw.GetString() : null;
        var mapped = TruynException.FromHttp(source.GetProperty("httpStatus").GetInt32(), code, "bounded diagnostic");
        var expect = item.GetProperty("expect");
        var expected = expect.GetProperty("code").GetString();
        var normal = mapped.Code switch
        {
            TruynErrorCode.VersionMismatch => "version_mismatch",
            TruynErrorCode.Unauthenticated => "unauthenticated",
            TruynErrorCode.PermissionDenied => "permission_denied",
            TruynErrorCode.DeadlineExceeded => "deadline_exceeded",
            TruynErrorCode.InvalidArgument => "invalid_argument",
            TruynErrorCode.Unimplemented => "unimplemented",
            TruynErrorCode.Cancelled => "cancelled",
            TruynErrorCode.Transport => "transport_error",
            TruynErrorCode.InvalidResponse => "invalid_response",
            TruynErrorCode.NotFound => "not_found",
            TruynErrorCode.Conflict => "conflict",
            TruynErrorCode.ResourceExhausted => "resource_exhausted",
            TruynErrorCode.InternalError => "internal_error",
            _ => throw new InvalidOperationException("unknown P10 class")
        };
        if (normal != expected || mapped.Retryable != expect.GetProperty("retryable").GetBoolean())
            throw new InvalidOperationException("P10 .NET error mismatch: " + item.GetProperty("id").GetString());
    }
}

await using var provider = await TruynClient.ConnectAsync(new TruynClientOptions(relay), "dotnet-provider");
await using var requester = await TruynClient.ConnectAsync(new TruynClientOptions(relay), "dotnet-requester");
var capability = "sdk.release.dotnet." + Guid.NewGuid().ToString("N");
await provider.OfferAsync(capability, new Dictionary<string, object> { ["language"] = "dotnet" });
var receipt = await requester.NeedAsync(capability, new Dictionary<string, object> { ["question"] = "hello" });
var need = await provider.NextNeedAsync(TimeSpan.FromSeconds(5));
if (need.NeedId != receipt.NeedId || need.Requester != requester.NodeId || need.Capability != capability) throw new InvalidOperationException("invalid NEED correlation");
await provider.SendResultAsync(need.NeedId, new Dictionary<string, object> { ["ok"] = true, ["language"] = "dotnet" });
var result = await requester.WaitForResultAsync(receipt.NeedId, TimeSpan.FromSeconds(5));
if (result.Provider != provider.NodeId) throw new InvalidOperationException("invalid RESULT provider");
var recovered = await requester.RecoverDurableAsync();
if (!recovered.Any(x => x.GetProperty("eventId").GetString() == "result:" + receipt.NeedId))
    throw new InvalidOperationException("durable result missing before ACK");
await requester.AcknowledgeDurableAsync("result:" + receipt.NeedId);
if ((await requester.RecoverDurableAsync()).Any(x => x.GetProperty("eventId").GetString() == "result:" + receipt.NeedId))
    throw new InvalidOperationException("ACKed signed result replayed");
var cancelReceipt = await requester.NeedAsync(capability, new Dictionary<string, object> { ["cancel"] = true });
await requester.CancelNeedAsync(cancelReceipt.NeedId, "sdk_conformance_cancel");
Console.WriteLine("PASS dotnet developer-release conformance");

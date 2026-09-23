using System.Reflection;
using System.Text.Json;
using Truyn.Sdk;

if (args.Length != 1) throw new ArgumentException("relay URL is required");
AssertSharedEndpointFixtures();
var relay = new Uri(args[0]);
var descriptorUrl = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_URL");
var descriptorPublicKey = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY");
var descriptorIdentity = Environment.GetEnvironmentVariable("TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY");
if (string.IsNullOrWhiteSpace(descriptorUrl) || string.IsNullOrWhiteSpace(descriptorPublicKey) || string.IsNullOrWhiteSpace(descriptorIdentity)) throw new ArgumentException("descriptor conformance fixture is required");
var descriptor = await AgentDescriptors.FetchAsync(new Uri(descriptorUrl), descriptorPublicKey);
if (descriptor.Descriptor.Identity != descriptorIdentity || descriptor.Selection.Protocol != "TRUYN/1" || descriptor.Selection.Interface.GetProperty("type").GetString() != "https" || descriptor.Signer.KeyBinding != "identity") throw new InvalidOperationException("invalid Agent Descriptor verification");

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
var cancelReceipt = await requester.NeedAsync(capability, new Dictionary<string, object> { ["cancel"] = true });
await requester.CancelNeedAsync(cancelReceipt.NeedId, "sdk_conformance_cancel");
Console.WriteLine("PASS dotnet developer-release conformance");

static void AssertSharedEndpointFixtures()
{
    var required = new HashSet<string>(StringComparer.Ordinal)
    {
        "descriptor.interface-endpoint-missing",
        "descriptor.interface-endpoint-blank",
        "descriptor.interface-type-blank"
    };
    using var fixture = JsonDocument.Parse(File.ReadAllText("sdk/conformance/v1/agent-descriptor-runtime-fixtures.json"));
    var validate = typeof(AgentDescriptors).GetMethod("Validate", BindingFlags.NonPublic | BindingFlags.Static)
        ?? throw new InvalidOperationException("Agent Descriptor production validation gate is unavailable");
    var checkedCases = 0;
    foreach (var testCase in fixture.RootElement.GetProperty("descriptorRuntimeCases").EnumerateArray())
    {
        var id = testCase.GetProperty("id").GetString();
        if (id is null || !required.Contains(id)) continue;
        checkedCases++;
        try
        {
            validate.Invoke(null, new object[] { testCase.GetProperty("value") });
            throw new InvalidOperationException($".NET accepted invalid shared descriptor fixture {id}");
        }
        catch (TargetInvocationException invocation) when (invocation.InnerException is TruynException error)
        {
            if (error.Code != TruynErrorCode.InvalidResponse || !error.Message.Contains("interfaces require non-empty type and endpoint", StringComparison.Ordinal))
                throw new InvalidOperationException($".NET rejected shared descriptor fixture for the wrong reason {id}", error);
        }
    }
    if (checkedCases != required.Count) throw new InvalidOperationException($"missing shared endpoint parity fixtures: checked={checkedCases}");
}

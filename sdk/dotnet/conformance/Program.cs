using Truyn.Sdk;

if (args.Length != 1) throw new ArgumentException("relay URL is required");
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

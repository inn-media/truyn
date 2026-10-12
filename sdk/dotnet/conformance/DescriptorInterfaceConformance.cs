using System.Text.Json;
using System.Reflection;
using Truyn.Sdk;
internal static class DescriptorInterfaceConformance
{
    public static async Task RunAsync()
    {
        using var input = JsonDocument.Parse(File.ReadAllText(Environment.GetEnvironmentVariable("TRUYN_DESCRIPTOR_CASES_FILE") ?? throw new InvalidOperationException("Descriptor fixture required")));
        var suite = input.RootElement;
        var rows = new List<Dictionary<string, object?>>();
        var nullable = new NullabilityInfoContext().Create(typeof(AgentInterface).GetProperty(nameof(AgentInterface.Url))!);
        if (nullable.ReadState != NullabilityState.Nullable) throw new InvalidOperationException("optional endpoint must be nullable");
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        foreach (var item in suite.GetProperty("cases").EnumerateArray())
        {
            try
            {
                var value = await AgentDescriptors.FetchAsync(new Uri(item.GetProperty("url").GetString()!),suite.GetProperty("publicKeyPem").GetString()!,supportedInterfaces:suite.GetProperty("supportedInterfaces").EnumerateArray().Select(x => x.GetString()!).ToArray(),httpClient:http);
                var selected = value.Selection.Interface;
                var model = value.Descriptor.Interfaces[0];
                var expectedEndpoint = selected.TryGetProperty("endpoint", out var endpoint) ? endpoint.GetString() : null;
                if (model.Type != selected.GetProperty("type").GetString() || model.Url != expectedEndpoint)
                    throw new InvalidOperationException("typed Descriptor interface projection lost a validated field");
                var roundtrip = JsonSerializer.SerializeToElement(model, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
                if (roundtrip.TryGetProperty("url", out _) || (expectedEndpoint is null
                    ? roundtrip.TryGetProperty("endpoint", out _)
                    : !roundtrip.TryGetProperty("endpoint", out var decoded) || decoded.GetString() != expectedEndpoint))
                    throw new InvalidOperationException("optional endpoint wire mapping must preserve omission and values");
                rows.Add(new() { ["id"]=item.GetProperty("id").GetString(),["ok"]=true,["identity"]=value.Descriptor.Identity,["protocol"]=value.Selection.Protocol,["interface"]=value.Selection.Interface,["keyBinding"]=value.Signer.KeyBinding });
            }
            catch (TruynException error) { rows.Add(new() { ["id"]=item.GetProperty("id").GetString(),["ok"]=false,["message"]=error.Message }); }
        }
        File.WriteAllText(Environment.GetEnvironmentVariable("TRUYN_DESCRIPTOR_RESULT_FILE") ?? throw new InvalidOperationException("Descriptor result path required"),JsonSerializer.Serialize(rows));
    }
}

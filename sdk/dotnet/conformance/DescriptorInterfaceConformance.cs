using System.Text.Json;
using Truyn.Sdk;
internal static class DescriptorInterfaceConformance
{
    public static async Task RunAsync()
    {
        using var input = JsonDocument.Parse(File.ReadAllText(Environment.GetEnvironmentVariable("TRUYN_DESCRIPTOR_CASES_FILE") ?? throw new InvalidOperationException("Descriptor fixture required")));
        var suite = input.RootElement;
        var rows = new List<Dictionary<string, object?>>();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        foreach (var item in suite.GetProperty("cases").EnumerateArray())
        {
            try
            {
                var value = await AgentDescriptors.FetchAsync(new Uri(item.GetProperty("url").GetString()!),suite.GetProperty("publicKeyPem").GetString()!,httpClient:http);
                rows.Add(new() { ["id"]=item.GetProperty("id").GetString(),["ok"]=true,["identity"]=value.Descriptor.Identity,["protocol"]=value.Selection.Protocol,["interface"]=value.Selection.Interface,["keyBinding"]=value.Signer.KeyBinding });
            }
            catch (TruynException error) { rows.Add(new() { ["id"]=item.GetProperty("id").GetString(),["ok"]=false,["message"]=error.Message }); }
        }
        File.WriteAllText(Environment.GetEnvironmentVariable("TRUYN_DESCRIPTOR_RESULT_FILE") ?? throw new InvalidOperationException("Descriptor result path required"),JsonSerializer.Serialize(rows));
    }
}

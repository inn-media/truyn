using System.Net.Http.Headers;
using System.Text.Json;

namespace Truyn.Sdk;

public sealed record AgentDescriptorSelection(string DescriptorVersion, string Protocol, JsonElement Interface);
public sealed record AgentDescriptorSigner(string Identity, string KeyBinding);
public sealed record VerifiedAgentDescriptor(AgentDescriptor Descriptor, AgentDescriptorSelection Selection, AgentDescriptorSigner Signer);

/// <summary>Native Agent Descriptor retrieval, expiry validation, identity-key verification and negotiation.</summary>
public static class AgentDescriptors
{
    private static readonly string[] DefaultProtocols = ["TRUYN/1"];
    private static readonly string[] DefaultInterfaces = ["https", "websocket", "truyn-quic", "mcp"];

    public static async Task<VerifiedAgentDescriptor> FetchAsync(
        Uri descriptorUri,
        string publicKeyPem,
        IEnumerable<string>? supportedProtocols = null,
        IEnumerable<string>? supportedInterfaces = null,
        HttpClient? httpClient = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(descriptorUri);
        if (!descriptorUri.IsAbsoluteUri || (descriptorUri.Scheme != Uri.UriSchemeHttp && descriptorUri.Scheme != Uri.UriSchemeHttps))
            throw new TruynException(TruynErrorCode.InvalidArgument, "Agent Descriptor URL must be absolute HTTP(S)", false);
        if (string.IsNullOrWhiteSpace(publicKeyPem))
            throw new TruynException(TruynErrorCode.Unauthenticated, "Agent Descriptor identity public key is required", false);

        var ownsClient = httpClient is null;
        var client = httpClient ?? new HttpClient();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, descriptorUri);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new TruynException(TruynErrorCode.InvalidResponse, $"Descriptor HTTP {(int)response.StatusCode}", false);
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            var raw = document.RootElement.Clone();
            Validate(raw);
            Verify(raw, publicKeyPem);
            var protocol = SelectProtocol(raw, supportedProtocols ?? DefaultProtocols);
            var selectedInterface = SelectInterface(raw, supportedInterfaces ?? DefaultInterfaces);
            var descriptor = raw.Deserialize<AgentDescriptor>(CanonicalJson.WireOptions) ?? throw Invalid("Agent Descriptor could not be decoded");
            return new VerifiedAgentDescriptor(descriptor, new AgentDescriptorSelection("1", protocol, selectedInterface), new AgentDescriptorSigner(descriptor.Identity, "identity"));
        }
        catch (OperationCanceledException error)
        {
            throw new TruynException(TruynErrorCode.Cancelled, error.Message, false, error);
        }
        catch (HttpRequestException error)
        {
            throw new TruynException(TruynErrorCode.Transport, error.Message, true, error);
        }
        catch (JsonException error)
        {
            throw Invalid("Agent Descriptor response is invalid JSON", error);
        }
        finally
        {
            if (ownsClient) client.Dispose();
        }
    }

    private static void Validate(JsonElement raw)
    {
        if (raw.ValueKind != JsonValueKind.Object) throw Invalid("Agent Descriptor must be a JSON object");
        if (String(raw, "schema") != "truyn.agent-descriptor/v1" || String(raw, "descriptorVersion") != "1")
            throw new TruynException(TruynErrorCode.VersionMismatch, "unsupported Agent Descriptor schema/version", false);
        var identity = String(raw, "identity");
        if (identity is null || !identity.StartsWith("truyn:node:", StringComparison.Ordinal)) throw Invalid("invalid Agent Descriptor identity");
        if (!raw.TryGetProperty("protocols", out var protocols) || protocols.ValueKind != JsonValueKind.Array || protocols.GetArrayLength() == 0) throw Invalid("Agent Descriptor protocols are required");
        if (!raw.TryGetProperty("interfaces", out var interfaces) || interfaces.ValueKind != JsonValueKind.Array || interfaces.GetArrayLength() == 0) throw Invalid("Agent Descriptor interfaces are required");
        if (!raw.TryGetProperty("capabilities", out var capabilities) || capabilities.ValueKind != JsonValueKind.Array) throw Invalid("Agent Descriptor capabilities are invalid");
        if (!DateTimeOffset.TryParse(String(raw, "issuedAt"), out var issuedAt) || !DateTimeOffset.TryParse(String(raw, "expiresAt"), out var expiresAt) || expiresAt <= issuedAt) throw Invalid("invalid Agent Descriptor expiry window");
        if (expiresAt <= DateTimeOffset.UtcNow) throw Invalid("Agent Descriptor has expired");
        if (Signatures(raw).Count == 0) throw new TruynException(TruynErrorCode.Unauthenticated, "Agent Descriptor signature is required", false);
    }

    private static void Verify(JsonElement raw, string publicKeyPem)
    {
        var identity = String(raw, "identity")!;
        string resolved;
        try { resolved = LocalIdentity.NodeIdFromPublicKey(publicKeyPem); }
        catch (Exception error) { throw new TruynException(TruynErrorCode.Unauthenticated, "invalid Agent Descriptor public key", false, error); }
        if (!string.Equals(resolved, identity, StringComparison.Ordinal))
            throw new TruynException(TruynErrorCode.Unauthenticated, "Agent Descriptor identity key mismatch", false);

        var unsigned = new Dictionary<string, object?>();
        foreach (var property in raw.EnumerateObject())
            if (property.Name is not ("signature" or "signatures")) unsigned[property.Name] = property.Value.Clone();
        var payload = CanonicalJson.Serialize(unsigned);
        foreach (var signature in Signatures(raw)) if (LocalIdentity.Verify(publicKeyPem, payload, signature)) return;
        throw new TruynException(TruynErrorCode.Unauthenticated, "Agent Descriptor signature verification failed", false);
    }

    private static string SelectProtocol(JsonElement raw, IEnumerable<string> supported)
    {
        var advertised = raw.GetProperty("protocols").EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString()).ToHashSet(StringComparer.Ordinal);
        foreach (var candidate in supported) if (advertised.Contains(candidate)) return candidate;
        throw new TruynException(TruynErrorCode.VersionMismatch, "no mutually supported TRUYN protocol", false);
    }

    private static JsonElement SelectInterface(JsonElement raw, IEnumerable<string> supported)
    {
        var accepted = supported.ToHashSet(StringComparer.Ordinal);
        foreach (var item in raw.GetProperty("interfaces").EnumerateArray())
            if (item.ValueKind == JsonValueKind.Object && accepted.Contains(String(item, "type") ?? "")) return item.Clone();
        throw new TruynException(TruynErrorCode.VersionMismatch, "no mutually supported Agent Descriptor interface", false);
    }

    private static List<string> Signatures(JsonElement raw)
    {
        var values = new List<string>();
        var single = String(raw, "signature"); if (single is not null) values.Add(single);
        if (raw.TryGetProperty("signatures", out var many) && many.ValueKind == JsonValueKind.Array)
            foreach (var item in many.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString())) values.Add(item.GetString()!);
                else if (item.ValueKind == JsonValueKind.Object) { var value = String(item, "value"); if (value is not null) values.Add(value); }
            }
        return values;
    }

    private static string? String(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString() : null;
    private static TruynException Invalid(string message, Exception? inner = null) => new(TruynErrorCode.InvalidResponse, message, false, inner);
}

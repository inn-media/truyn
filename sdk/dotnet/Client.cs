using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Truyn.Sdk;

public sealed class TruynClient : IAsyncDisposable
{
    public const string Protocol = "TRUYN/1";
    public const string AgentDescriptorSchema = "truyn.agent-descriptor/v1";

    private readonly HttpClient _http;
    private readonly LocalIdentity _identity;
    private readonly List<RelayEvent> _pending = [];
    private string? _sessionToken;

    public TruynClient(TruynClientOptions options)
    {
        Options = options ?? throw new ArgumentNullException(nameof(options));
        if (options.BaseUri is null || (options.BaseUri.Scheme != Uri.UriSchemeHttp && options.BaseUri.Scheme != Uri.UriSchemeHttps))
            throw new TruynException(TruynErrorCode.InvalidArgument, "BaseUri must be an absolute HTTP(S) URI", false);
        _http = options.HttpClient ?? new HttpClient { BaseAddress = EnsureTrailingSlash(options.BaseUri), Timeout = options.Timeout ?? TimeSpan.FromSeconds(30) };
        if (_http.BaseAddress is null) _http.BaseAddress = EnsureTrailingSlash(options.BaseUri);
        _identity = LocalIdentity.Create();
        _sessionToken = options.AuthToken;
    }

    public TruynClientOptions Options { get; }
    public string NodeId => _identity.NodeId;

    public static async Task<TruynClient> ConnectAsync(TruynClientOptions options, string? name = null, CancellationToken cancellationToken = default)
    {
        var client = new TruynClient(options);
        await client.RegisterAsync(name, cancellationToken).ConfigureAwait(false);
        return client;
    }

    public Task<Identity> GetIdentityAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new Identity(_identity.NodeId, _identity.PublicKeyPem));
    }

    public async Task RegisterAsync(string? name = null, CancellationToken cancellationToken = default)
    {
        var envelope = Envelope("IDENTITY", new Dictionary<string, object?>
        {
            ["nodeId"] = _identity.NodeId,
            ["algorithm"] = LocalIdentity.Algorithm,
            ["protocols"] = Options.SupportedProtocols ?? new[] { Protocol },
            ["name"] = name
        });
        var body = await RequestAsync(HttpMethod.Post, "v1/register", new { envelope }, false, cancellationToken).ConfigureAwait(false);
        if (!body.TryGetProperty("sessionToken", out var token) || token.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(token.GetString()))
            throw Invalid("Relay returned an invalid registration response");
        _sessionToken = token.GetString();
    }

    public async Task<IReadOnlyList<Offer>> DiscoverAsync(string capability, CancellationToken cancellationToken = default)
    {
        Require(capability, "capability is required");
        var body = await RequestAsync(HttpMethod.Get, "v1/offers?capability=" + Uri.EscapeDataString(capability), null, true, cancellationToken).ConfigureAwait(false);
        if (!body.TryGetProperty("offers", out var offers) || offers.ValueKind != JsonValueKind.Array) throw Invalid("Relay returned an invalid authorized discovery response");
        var result = new List<Offer>();
        foreach (var item in offers.EnumerateArray())
        {
            var offer = item.Deserialize<Offer>(CanonicalJson.WireOptions) ?? throw Invalid("Relay returned an invalid OFFER");
            result.Add(offer);
        }
        return result;
    }

    public async Task<JsonElement> OfferAsync(string capability, IReadOnlyDictionary<string, object>? metadata = null, CancellationToken cancellationToken = default)
    {
        Require(capability, "capability is required");
        var envelope = Envelope("OFFER", new Dictionary<string, object?>
        {
            ["capability"] = new Dictionary<string, object?> { ["name"] = capability },
            ["metadata"] = metadata ?? new Dictionary<string, object>()
        });
        return await RequestAsync(HttpMethod.Post, "v1/offers", new { envelope }, true, cancellationToken).ConfigureAwait(false);
    }

    public async Task<Offer> PublishOfferAsync(Offer offer, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(offer);
        await RequestAsync(HttpMethod.Post, "v1/offers", new { envelope = offer }, true, cancellationToken).ConfigureAwait(false);
        return offer;
    }

    public async Task<NeedReceipt> NeedAsync(string capability, object input, IReadOnlyDictionary<string, object>? policy = null, CancellationToken cancellationToken = default)
    {
        Require(capability, "capability is required");
        var envelope = Envelope("NEED", new Dictionary<string, object?>
        {
            ["capability"] = new Dictionary<string, object?> { ["name"] = capability },
            ["input"] = input,
            ["policy"] = policy ?? new Dictionary<string, object>()
        });
        var body = await RequestAsync(HttpMethod.Post, "v1/needs", new { envelope }, true, cancellationToken).ConfigureAwait(false);
        var ok = body.TryGetProperty("ok", out var okValue) && okValue.ValueKind == JsonValueKind.True;
        var needId = String(body, "needId");
        var provider = String(body, "provider");
        if (!ok || needId is null || provider is null) throw Invalid("Relay returned an invalid NEED receipt");
        return new NeedReceipt(ok, needId, provider, body.TryGetProperty("providerTrust", out var trust) ? trust.Clone() : null);
    }

    public async Task<Need> SubmitNeedAsync(Need need, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(need);
        await RequestAsync(HttpMethod.Post, "v1/needs", new { envelope = need }, true, cancellationToken).ConfigureAwait(false);
        return need;
    }

    public async Task<JsonElement> SendResultAsync(string requestId, object output, IReadOnlyDictionary<string, object>? metadata = null, CancellationToken cancellationToken = default)
    {
        Require(requestId, "requestId is required");
        var envelope = Envelope("RESULT", new Dictionary<string, object?>
        {
            ["requestId"] = requestId,
            ["output"] = output,
            ["completedAt"] = IsoNow(),
            ["metadata"] = metadata ?? new Dictionary<string, object>()
        });
        return await RequestAsync(HttpMethod.Post, "v1/results", new { envelope }, true, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<RelayEvent>> PollAsync(CancellationToken cancellationToken = default)
    {
        var body = await RequestAsync(HttpMethod.Get, "v1/events?nodeId=" + Uri.EscapeDataString(_identity.NodeId), null, true, cancellationToken).ConfigureAwait(false);
        if (!body.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array) throw Invalid("Relay returned an invalid events response");
        var result = new List<RelayEvent>();
        foreach (var item in events.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("envelope", out var envelope)) throw Invalid("Relay returned an invalid event");
            var envelopeClone = envelope.Clone();
            result.Add(new RelayEvent(String(item, "kind") ?? "", envelopeClone, VerifyEnvelope(envelopeClone), item.TryGetProperty("trust", out var trust) ? trust.Clone() : null));
        }
        return result;
    }

    public async Task<NeedEvent> NextNeedAsync(TimeSpan? timeout = null, CancellationToken cancellationToken = default)
    {
        var relayEvent = await WaitEventAsync(item => item.Kind == "NEED", timeout, cancellationToken).ConfigureAwait(false);
        if (!relayEvent.Verified) throw Invalid("Received NEED failed signature verification");
        var payload = relayEvent.Envelope.GetProperty("payload");
        var capabilityValue = payload.GetProperty("capability");
        var capability = capabilityValue.ValueKind == JsonValueKind.Object ? String(capabilityValue, "name") : capabilityValue.GetString();
        var needId = String(relayEvent.Envelope, "id");
        var requester = String(relayEvent.Envelope, "from");
        if (needId is null || requester is null || string.IsNullOrWhiteSpace(capability)) throw Invalid("Received invalid NEED event");
        return new NeedEvent(needId, requester, capability!, payload.TryGetProperty("input", out var input) ? input.Clone() : default, payload.TryGetProperty("policy", out var policy) ? policy.Clone() : default, relayEvent.Envelope);
    }

    public async Task<ResultEvent> WaitForResultAsync(string needId, TimeSpan? timeout = null, CancellationToken cancellationToken = default)
    {
        Require(needId, "needId is required");
        var relayEvent = await WaitEventAsync(item =>
        {
            if (item.Kind != "RESULT" || !item.Envelope.TryGetProperty("payload", out var payload)) return false;
            return String(payload, "requestId") == needId;
        }, timeout, cancellationToken).ConfigureAwait(false);
        if (!relayEvent.Verified) throw Invalid("Received RESULT failed signature verification");
        var payload = relayEvent.Envelope.GetProperty("payload");
        var provider = String(relayEvent.Envelope, "from") ?? throw Invalid("Received invalid RESULT event");
        return new ResultEvent(needId, provider, payload.TryGetProperty("output", out var output) ? output.Clone() : default, payload.TryGetProperty("metadata", out var metadata) ? metadata.Clone() : default, relayEvent.Trust, relayEvent.Envelope);
    }

    public async Task<Result> GetResultAsync(string needId, CancellationToken cancellationToken = default)
    {
        var result = await WaitForResultAsync(needId, Options.Timeout, cancellationToken).ConfigureAwait(false);
        return result.Envelope.Deserialize<Result>(CanonicalJson.WireOptions) ?? throw Invalid("Relay returned an invalid RESULT envelope");
    }

    public Task RevokeOfferAsync(string offerId, CancellationToken cancellationToken = default) => RevokeAsync(offerId, "offer", "revoked_by_owner", cancellationToken);
    public Task CancelNeedAsync(string needId, string reason = "revoked_by_owner", CancellationToken cancellationToken = default) => RevokeAsync(needId, "need", reason, cancellationToken);

    private async Task RevokeAsync(string targetId, string targetKind, string reason, CancellationToken cancellationToken)
    {
        Require(targetId, "targetId is required");
        if (targetKind is not ("offer" or "need")) throw new TruynException(TruynErrorCode.InvalidArgument, "targetKind must be need or offer", false);
        var envelope = Envelope("REVOKE", new Dictionary<string, object?> { ["targetId"] = targetId, ["targetKind"] = targetKind, ["reason"] = string.IsNullOrWhiteSpace(reason) ? "revoked_by_owner" : reason });
        await RequestAsync(HttpMethod.Post, "v1/revoke", new { envelope }, true, cancellationToken).ConfigureAwait(false);
    }

    public Task<AgentDescriptor> GetAgentDescriptorAsync(Uri descriptorUri, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(descriptorUri);
        return Task.FromException<AgentDescriptor>(new TruynException(TruynErrorCode.Unimplemented, "Agent Descriptor serving/discovery lifecycle is outside the Developer Release Layer", false));
    }

    private async Task<RelayEvent> WaitEventAsync(Func<RelayEvent, bool> predicate, TimeSpan? timeout, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(timeout ?? Options.Timeout ?? TimeSpan.FromSeconds(5));
        while (true)
        {
            lock (_pending)
            {
                var index = _pending.FindIndex(item => predicate(item));
                if (index >= 0) { var matched = _pending[index]; _pending.RemoveAt(index); return matched; }
            }
            IReadOnlyList<RelayEvent> polled;
            try { polled = await PollAsync(deadline.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { throw new TruynException(cancellationToken.IsCancellationRequested ? TruynErrorCode.Cancelled : TruynErrorCode.DeadlineExceeded, "Timed out or cancelled waiting for TRUYN event", !cancellationToken.IsCancellationRequested); }
            var match = polled.FirstOrDefault(item => predicate(item));
            lock (_pending) foreach (var item in polled) if (!ReferenceEquals(item, match)) _pending.Add(item);
            if (match is not null) return match;
            try { await Task.Delay(20, deadline.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { throw new TruynException(cancellationToken.IsCancellationRequested ? TruynErrorCode.Cancelled : TruynErrorCode.DeadlineExceeded, "Timed out or cancelled waiting for TRUYN event", !cancellationToken.IsCancellationRequested); }
        }
    }

    private Dictionary<string, object?> Envelope(string type, object payload)
    {
        var unsigned = new Dictionary<string, object?>
        {
            ["protocol"] = Protocol,
            ["type"] = type,
            ["id"] = Guid.NewGuid().ToString(),
            ["from"] = _identity.NodeId,
            ["to"] = null,
            ["createdAt"] = IsoNow(),
            ["publicKey"] = _identity.PublicKeyPem,
            ["payload"] = payload
        };
        var signature = _identity.Sign(CanonicalJson.Serialize(unsigned));
        return new Dictionary<string, object?>(unsigned) { ["signature"] = signature };
    }

    private static bool VerifyEnvelope(JsonElement envelope)
    {
        try
        {
            if (String(envelope, "protocol") != Protocol) return false;
            var from = String(envelope, "from"); var publicKey = String(envelope, "publicKey"); var signature = String(envelope, "signature");
            if (from is null || publicKey is null || signature is null || LocalIdentity.NodeIdFromPublicKey(publicKey) != from) return false;
            var unsigned = new Dictionary<string, object?>();
            foreach (var property in envelope.EnumerateObject()) if (property.Name != "signature") unsigned[property.Name] = property.Value.Clone();
            return LocalIdentity.Verify(publicKey, CanonicalJson.Serialize(unsigned), signature);
        }
        catch { return false; }
    }

    private async Task<JsonElement> RequestAsync(HttpMethod method, string path, object? body, bool auth, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (auth)
        {
            if (string.IsNullOrWhiteSpace(_sessionToken)) throw new TruynException(TruynErrorCode.Unauthenticated, "A relay session token is required", false);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _sessionToken);
        }
        if (body is not null) request.Content = new ByteArrayContent(CanonicalJson.Serialize(body)) { Headers = { ContentType = new MediaTypeHeaderValue("application/json") } };
        HttpResponseMessage response;
        try { response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false); }
        catch (OperationCanceledException error) { throw new TruynException(cancellationToken.IsCancellationRequested ? TruynErrorCode.Cancelled : TruynErrorCode.DeadlineExceeded, error.Message, !cancellationToken.IsCancellationRequested, error); }
        catch (HttpRequestException error) { throw new TruynException(TruynErrorCode.Transport, error.Message, true, error); }
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        JsonDocument document;
        try { document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false); }
        catch (JsonException error) { throw Invalid($"Relay returned non-JSON response (HTTP {(int)response.StatusCode})", error); }
        using (document)
        {
            var root = document.RootElement.Clone();
            if (!response.IsSuccessStatusCode)
            {
                var relay = root.ValueKind == JsonValueKind.Object ? String(root, "error") : null;
                throw HttpError(response.StatusCode, relay ?? $"HTTP {(int)response.StatusCode}");
            }
            if (root.ValueKind != JsonValueKind.Object) throw Invalid("Relay response must be a JSON object");
            return root;
        }
    }

    private static TruynException HttpError(HttpStatusCode status, string message) => status switch
    {
        HttpStatusCode.Unauthorized => new(TruynErrorCode.Unauthenticated, message, false),
        HttpStatusCode.Forbidden => new(TruynErrorCode.PermissionDenied, message, false),
        HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests or HttpStatusCode.InternalServerError or HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout => new(TruynErrorCode.Transport, message, true),
        _ => new(TruynErrorCode.InvalidResponse, message, false)
    };

    private static string? String(JsonElement element, string property) => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString() : null;
    private static void Require(string? value, string message) { if (string.IsNullOrWhiteSpace(value)) throw new TruynException(TruynErrorCode.InvalidArgument, message, false); }
    private static TruynException Invalid(string message, Exception? inner = null) => new(TruynErrorCode.InvalidResponse, message, false, inner);
    private static Uri EnsureTrailingSlash(Uri uri) => uri.AbsoluteUri.EndsWith('/') ? uri : new Uri(uri.AbsoluteUri + "/");
    private static string IsoNow() => DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    public ValueTask DisposeAsync() { if (Options.HttpClient is null) _http.Dispose(); return ValueTask.CompletedTask; }
}

public sealed record TruynClientOptions(
    Uri BaseUri,
    string? AuthToken = null,
    IReadOnlyList<string>? SupportedProtocols = null,
    TimeSpan? Timeout = null,
    HttpClient? HttpClient = null);

public sealed record NeedReceipt(bool Ok, string NeedId, string Provider, JsonElement? ProviderTrust);
public sealed record RelayEvent(string Kind, JsonElement Envelope, bool Verified, JsonElement? Trust);
public sealed record NeedEvent(string NeedId, string Requester, string Capability, JsonElement Input, JsonElement Policy, JsonElement Envelope);
public sealed record ResultEvent(string NeedId, string Provider, JsonElement Output, JsonElement Metadata, JsonElement? Trust, JsonElement Envelope);

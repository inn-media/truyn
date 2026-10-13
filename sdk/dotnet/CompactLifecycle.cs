using System.Text.Json;

namespace Truyn.Sdk;

public sealed partial class TruynClient
{
    private async Task<JsonElement> SendCompactAsync(string path, string code, string requestId, object payload, CancellationToken cancellationToken)
    {
        Require(requestId, "requestId required");
        if (requestId.Length > 4070 || code is not ("N" or "R" or "T")) throw new TruynException(TruynErrorCode.InvalidArgument, "invalid compact identity or kind", false);
        var signature = _identity.Sign(CanonicalJson.Serialize(new object[] { code, requestId, payload })).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return await RequestAsync(HttpMethod.Post, path, new { frame = new { t = code, i = requestId, s = signature }, payload }, true, cancellationToken).ConfigureAwait(false);
    }

    public async Task<JsonElement> CompactNeedAsync(string capability, object input, IReadOnlyDictionary<string, object>? policy = null, CancellationToken cancellationToken = default)
    {
        Require(capability, "capability required");
        var requestId = Guid.NewGuid().ToString("N");
        var receipt = await SendCompactAsync("v1/fast/needs?waitMs=0", "N", requestId, new { capability = new { name = capability }, input, policy = policy ?? new Dictionary<string, object>() }, cancellationToken).ConfigureAwait(false);
        if (!receipt.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True || String(receipt, "needId") != requestId) throw Invalid("invalid compact NEED receipt");
        return receipt;
    }

    public Task<JsonElement> PartialAsync(string requestId, long sequence, object? delta, IReadOnlyDictionary<string, object>? metadata = null, CancellationToken cancellationToken = default)
    {
        if (sequence < 0 || sequence > 9007199254740991L) throw new TruynException(TruynErrorCode.InvalidArgument, "sequence must be a non-negative safe integer", false);
        // Dictionary entries preserve an explicit null delta in signed JSON.
        return SendCompactAsync("v1/fast/partials", "T", requestId, new Dictionary<string, object?> { ["sequence"] = sequence, ["delta"] = delta, ["metadata"] = metadata ?? new Dictionary<string, object>() }, cancellationToken);
    }
    public Task<JsonElement> CompactResultAsync(string requestId, object? output, IReadOnlyDictionary<string, object>? metadata = null, CancellationToken cancellationToken = default) =>
        SendCompactAsync("v1/fast/results", "R", requestId, new Dictionary<string, object?> { ["output"] = output, ["metadata"] = metadata ?? new Dictionary<string, object>() }, cancellationToken);

    public async Task<IReadOnlyList<CompactLifecycleEvent>> PollCompactAsync(CancellationToken cancellationToken = default)
    {
        var response = await RequestAsync(HttpMethod.Get, "v1/fast/events?nodeId=" + Uri.EscapeDataString(NodeId) + "&waitMs=0", null, true, cancellationToken).ConfigureAwait(false);
        if (!response.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array || events.GetArrayLength() > 1024) throw Invalid("invalid compact events");
        var result = new List<CompactLifecycleEvent>();
        foreach (var item in events.EnumerateArray())
        {
            var kind = String(item, "kind") ?? throw Invalid("missing event kind");
            if (item.TryGetProperty("envelope", out var envelope))
            {
                if (String(envelope, "type") != kind || !VerifyEnvelope(envelope)) throw Invalid("invalid signed lifecycle envelope");
                result.Add(new CompactLifecycleEvent(kind, String(envelope, "id")!, envelope.GetProperty("payload").Clone(), true));
                continue;
            }
            var code = kind switch { "NEED" => "N", "RESULT" => "R", "PARTIAL" => "T", _ => throw Invalid("unsupported compact kind") };
            if (item.TryGetProperty("signedType", out var signed) && signed.GetString() != kind || item.TryGetProperty("priorResult", out _)) throw Invalid("compact translation or CHAIN is unsupported");
            var frame = item.GetProperty("frame"); var payload = item.GetProperty("payload");
            var requestId = String(frame, "i"); var text = String(frame, "s"); var from = String(item, "from");
            if (requestId is null || requestId.Length > 4070 || text is null || text.Length != 86 || from is null || String(frame, "t") != code || payload.ValueKind != JsonValueKind.Object) throw Invalid("invalid compact event shape");
            byte[] signature;
            try { signature = Convert.FromBase64String(text.Replace('-', '+').Replace('_', '/') + "=="); }
            catch (FormatException e) { throw Invalid("invalid compact signature encoding", e); }
            if (signature.Length != 64 || Convert.ToBase64String(signature).TrimEnd('=').Replace('+', '-').Replace('/', '_') != text) throw Invalid("noncanonical compact signature");
            var identity = await RequestAsync(HttpMethod.Get, "v1/nodes/" + Uri.EscapeDataString(from), null, true, cancellationToken).ConfigureAwait(false);
            var key = String(identity, "publicKey") ?? throw Invalid("missing signer key");
            if (String(identity, "nodeId") != from || LocalIdentity.NodeIdFromPublicKey(key) != from || !LocalIdentity.Verify(key, CanonicalJson.Serialize(new object[] { code, requestId, payload }), Convert.ToBase64String(signature))) throw Invalid("compact signature or signer mismatch");
            if (kind == "PARTIAL" && (!payload.TryGetProperty("sequence", out var seq) || !seq.TryGetInt64(out var sequence) || sequence < 0 || sequence > 9007199254740991L || !payload.TryGetProperty("delta", out _))) throw Invalid("invalid signed PARTIAL payload");
            result.Add(new CompactLifecycleEvent(kind, requestId, payload.Clone(), true));
        }
        return result;
    }
}

public sealed record CompactLifecycleEvent(string Kind, string RequestId, JsonElement Payload, bool Verified);

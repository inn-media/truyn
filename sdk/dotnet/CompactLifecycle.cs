using System.Text.Json;

namespace Truyn.Sdk;

public sealed partial class TruynClient
{
    private async Task<JsonElement> SendCompactAsync(string path, string code, string requestId, object payload, CancellationToken cancellationToken)
    {
        Require(requestId, "requestId required");
        if (requestId.Length > 4070 || code is not ("N" or "R" or "T" or "C" or "P" or "D")) throw new TruynException(TruynErrorCode.InvalidArgument, "invalid compact identity or kind", false);
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

    public Task<JsonElement> CompactChainAsync(IReadOnlyList<object> stages, CancellationToken cancellationToken = default)
    {
        if (stages is null || stages.Count < 2 || stages.Count > 8)
            throw new TruynException(TruynErrorCode.InvalidArgument, "invalid_chain_stages", false);
        return SendCompactAsync("v1/fast/chains", "C", Guid.NewGuid().ToString("N"),
            new { stages }, cancellationToken);
    }

    public async Task<JsonElement> PutContextAsync(IReadOnlyList<object> blocks,
        IReadOnlyList<string>? readers = null, IReadOnlyDictionary<string, object>? metadata = null,
        CancellationToken cancellationToken = default)
    {
        if (blocks is null || blocks.Count == 0)
            throw new TruynException(TruynErrorCode.InvalidArgument, "context_blocks_required", false);
        var receipt = await SendCompactAsync("v1/contexts", "P", Guid.NewGuid().ToString("N"),
            new { blocks, readers = readers ?? Array.Empty<string>(), metadata = metadata ?? new Dictionary<string, object>() }, cancellationToken).ConfigureAwait(false);
        if (!receipt.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True || String(receipt, "cid") is null)
            throw Invalid("invalid context PUT receipt");
        return receipt;
    }

    public async Task<JsonElement> DeltaContextAsync(string baseCid, IReadOnlyList<object> ops,
        IReadOnlyList<string>? readers = null, IReadOnlyDictionary<string, object>? metadata = null,
        CancellationToken cancellationToken = default)
    {
        Require(baseCid, "baseCid required");
        if (ops is null || ops.Count == 0)
            throw new TruynException(TruynErrorCode.InvalidArgument, "invalid_context_delta", false);
        var receipt = await SendCompactAsync("v1/contexts/" + Uri.EscapeDataString(baseCid) + "/delta", "D",
            Guid.NewGuid().ToString("N"),
            new { baseCid, ops, readers = readers ?? Array.Empty<string>(), metadata = metadata ?? new Dictionary<string, object>() }, cancellationToken).ConfigureAwait(false);
        if (!receipt.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True ||
            String(receipt, "baseCid") != baseCid || String(receipt, "cid") is null)
            throw Invalid("invalid context DELTA receipt");
        return receipt;
    }

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
            var chainStage = kind == "CHAIN_STAGE";
            var code = kind switch { "NEED" => "N", "RESULT" => "R", "PARTIAL" => "T", "CHAIN_STAGE" => "C", _ => throw Invalid("unsupported compact kind") };
            var stageIndex = -1;
            if (chainStage)
            {
                if (String(item, "signedType") != "CHAIN" || !item.TryGetProperty("stageIndex", out var index) ||
                    !index.TryGetInt32(out stageIndex) || stageIndex < 0 ||
                    !item.GetProperty("payload").TryGetProperty("stages", out var stages) ||
                    stages.ValueKind != JsonValueKind.Array || stages.GetArrayLength() < 2 ||
                    stages.GetArrayLength() > 8 || stageIndex >= stages.GetArrayLength())
                    throw Invalid("invalid CHAIN_STAGE unsigned metadata");
            }
            else if ((item.TryGetProperty("signedType", out var signed) && signed.GetString() != kind) ||
                      item.TryGetProperty("priorResult", out _))
                throw Invalid("unsupported compact translation");
            var frame = item.GetProperty("frame"); var payload = item.GetProperty("payload");
            var requestId = String(frame, "i"); var text = String(frame, "s"); var from = String(item, "from");
            if (requestId is null || requestId.Length > 4070 || text is null || text.Length != 86 || from is null || String(frame, "t") != code || payload.ValueKind != JsonValueKind.Object) throw Invalid("invalid compact event shape");
            var stageRequestId = requestId;
            if (chainStage)
            {
                stageRequestId = requestId[..Math.Min(requestId.Length, 15)] + stageIndex.ToString(System.Globalization.CultureInfo.InvariantCulture);
                if (String(item, "requestId") != stageRequestId) throw Invalid("CHAIN_STAGE request correlation mismatch");
            }
            byte[] signature;
            try { signature = Convert.FromBase64String(text.Replace('-', '+').Replace('_', '/') + "=="); }
            catch (FormatException e) { throw Invalid("invalid compact signature encoding", e); }
            if (signature.Length != 64 || Convert.ToBase64String(signature).TrimEnd('=').Replace('+', '-').Replace('/', '_') != text) throw Invalid("noncanonical compact signature");
            var identity = await RequestAsync(HttpMethod.Get, "v1/nodes/" + Uri.EscapeDataString(from), null, true, cancellationToken).ConfigureAwait(false);
            var key = String(identity, "publicKey") ?? throw Invalid("missing signer key");
            if (String(identity, "nodeId") != from || LocalIdentity.NodeIdFromPublicKey(key) != from || !LocalIdentity.Verify(key, CanonicalJson.Serialize(new object[] { code, requestId, payload }), Convert.ToBase64String(signature))) throw Invalid("compact signature or signer mismatch");
            var priorVerified = false;
            if (chainStage)
            {
                var hasPrior = item.TryGetProperty("priorResult", out var prior);
                if (stageIndex == 0 && hasPrior && prior.ValueKind != JsonValueKind.Null)
                    throw Invalid("unexpected first CHAIN prior result");
                if (stageIndex > 0)
                {
                    if (!hasPrior || prior.ValueKind != JsonValueKind.Object ||
                        String(prior, "kind") != "RESULT") throw Invalid("missing signed prior CHAIN RESULT");
                    var priorFrame = prior.GetProperty("frame");
                    var priorPayload = prior.GetProperty("payload");
                    var priorSigner = String(prior, "from");
                    var priorId = requestId[..Math.Min(requestId.Length, 15)] + (stageIndex - 1).ToString(System.Globalization.CultureInfo.InvariantCulture);
                    var priorText = String(priorFrame, "s");
                    if (String(priorFrame, "t") != "R" || String(priorFrame, "i") != priorId ||
                        priorPayload.ValueKind != JsonValueKind.Object || priorSigner is null || priorText is null)
                        throw Invalid("invalid prior CHAIN result shape");
                    byte[] priorSignature;
                    try { priorSignature = Convert.FromBase64String(priorText.Replace('-', '+').Replace('_', '/') + "=="); }
                    catch (FormatException e) { throw Invalid("invalid prior CHAIN signature", e); }
                    if (priorSignature.Length != 64 || Convert.ToBase64String(priorSignature).TrimEnd('=').Replace('+', '-').Replace('/', '_') != priorText)
                        throw Invalid("noncanonical prior CHAIN signature");
                    var priorIdentity = await RequestAsync(HttpMethod.Get,"v1/nodes/" + Uri.EscapeDataString(priorSigner),
                        null,true,cancellationToken).ConfigureAwait(false);
                    var priorKey = String(priorIdentity, "publicKey") ?? throw Invalid("missing prior signer key");
                    if (String(priorIdentity, "nodeId") != priorSigner ||
                        LocalIdentity.NodeIdFromPublicKey(priorKey) != priorSigner ||
                        !LocalIdentity.Verify(priorKey, CanonicalJson.Serialize(new object[] { "R", priorId, priorPayload }),
                            Convert.ToBase64String(priorSignature)))
                        throw Invalid("prior CHAIN result crypto verification failed");
                    priorVerified = true;
                }
            }
            if (kind == "PARTIAL" && (!payload.TryGetProperty("sequence", out var seq) || !seq.TryGetInt64(out var sequence) || sequence < 0 || sequence > 9007199254740991L || !payload.TryGetProperty("delta", out _))) throw Invalid("invalid signed PARTIAL payload");
            result.Add(new CompactLifecycleEvent(kind, stageRequestId, payload.Clone(), true, priorVerified));
        }
        return result;
    }
}

public sealed record CompactLifecycleEvent(string Kind, string RequestId, JsonElement Payload, bool Verified, bool PriorVerified = false);

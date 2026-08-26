using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Truyn.Sdk;

public static class StableSdkApi
{
    public const string Version = "1";
}

public sealed record Identity(string NodeId, string PublicKey);

public sealed record AgentDescriptor(
    string Schema,
    string DescriptorVersion,
    string Identity,
    IReadOnlyList<string> Protocols,
    IReadOnlyList<AgentInterface> Interfaces,
    IReadOnlyList<Capability> Capabilities,
    string IssuedAt,
    string ExpiresAt,
    string? Signature = null,
    IReadOnlyList<DescriptorSignature>? Signatures = null);

public sealed record AgentInterface(string Type, string Url);

public sealed record DescriptorSignature(string Alg, string Value, string? CreatedAt = null);

public sealed record Capability(string? Id = null, string? Name = null);

public record SignedEnvelope<TPayload>(
    string Protocol,
    string Type,
    string Id,
    string From,
    string? To,
    string CreatedAt,
    string PublicKey,
    TPayload Payload,
    string Signature);

public sealed record OfferPayload(Capability Capability, IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record NeedPayload(Capability Capability, object Input, IReadOnlyDictionary<string, object>? Policy = null);

public sealed record ResultPayload(
    string RequestId,
    object Output,
    string CompletedAt,
    IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record Offer(
    string Protocol,
    string Type,
    string Id,
    string From,
    string? To,
    string CreatedAt,
    string PublicKey,
    OfferPayload Payload,
    string Signature) : SignedEnvelope<OfferPayload>(Protocol, Type, Id, From, To, CreatedAt, PublicKey, Payload, Signature);

public sealed record Need(
    string Protocol,
    string Type,
    string Id,
    string From,
    string? To,
    string CreatedAt,
    string PublicKey,
    NeedPayload Payload,
    string Signature) : SignedEnvelope<NeedPayload>(Protocol, Type, Id, From, To, CreatedAt, PublicKey, Payload, Signature);

public sealed record Result(
    string Protocol,
    string Type,
    string Id,
    string From,
    string? To,
    string CreatedAt,
    string PublicKey,
    ResultPayload Payload,
    string Signature) : SignedEnvelope<ResultPayload>(Protocol, Type, Id, From, To, CreatedAt, PublicKey, Payload, Signature);

public sealed record ArtifactRef(string Value);

public sealed record ObjectPayload
{
    public string Kind { get; } = "object";
    public object Value { get; }
    public IReadOnlyDictionary<string, object>? Metadata { get; }

    public ObjectPayload(object value, IReadOnlyDictionary<string, object>? metadata = null)
    {
        Value = value;
        Metadata = metadata;
    }
}

/// <summary>Reference-only artifact payload. Binary/base64 data is intentionally absent.</summary>
public sealed record ArtifactPayload
{
    private static readonly Regex Sha256Pattern = new("^[0-9a-fA-F]{64}$", RegexOptions.CultureInvariant);

    public string Kind { get; } = "artifact";
    public string Ref { get; }
    public string MediaType { get; }
    public long? Bytes { get; }
    public string? Sha256 { get; }
    public IReadOnlyDictionary<string, object>? Metadata { get; }

    public ArtifactPayload(
        string @ref,
        string mediaType,
        long? bytes = null,
        string? sha256 = null,
        IReadOnlyDictionary<string, object>? metadata = null)
    {
        if (string.IsNullOrWhiteSpace(@ref)) throw new ArgumentException("artifact ref is required", nameof(@ref));
        if (string.IsNullOrWhiteSpace(mediaType)) throw new ArgumentException("artifact media type is required", nameof(mediaType));
        if (bytes is < 0) throw new ArgumentOutOfRangeException(nameof(bytes), "artifact bytes must be non-negative");
        if (!string.IsNullOrWhiteSpace(sha256) && !Sha256Pattern.IsMatch(sha256))
            throw new ArgumentException("artifact sha256 must be 64 hexadecimal characters", nameof(sha256));

        Ref = @ref;
        MediaType = mediaType;
        Bytes = bytes;
        Sha256 = sha256?.ToLowerInvariant();
        Metadata = metadata;
    }
}

public sealed record StreamItem<T>(long Sequence, T Item)
{
    public StreamItem(long sequence, T item) : this()
    {
        if (sequence < 0) throw new ArgumentOutOfRangeException(nameof(sequence), "stream sequence must be non-negative");
        Sequence = sequence;
        Item = item;
    }

    private StreamItem() : this(0, default!) { }
}

public sealed record NormalizedError(
    TruynErrorCode Code,
    string Message,
    bool Retryable,
    IReadOnlyDictionary<string, object>? Source = null);

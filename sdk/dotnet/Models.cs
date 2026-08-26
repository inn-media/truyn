using System.Collections.Generic;

namespace Truyn.Sdk;

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

public sealed record ArtifactPayload(
    string Kind,
    string ContentType,
    string? Name = null,
    string? Uri = null,
    string? Data = null,
    long? SizeBytes = null,
    string? Digest = null,
    IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record NeedRequest(
    string Capability,
    object Input,
    IReadOnlyList<ArtifactPayload>? Artifacts = null,
    IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record ResultResponse(
    string RequestId,
    object? Output = null,
    IReadOnlyList<ArtifactPayload>? Artifacts = null,
    string? CompletedAt = null,
    IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record StreamEvent(
    string Type,
    string? RequestId = null,
    long? Sequence = null,
    object? Delta = null,
    ArtifactPayload? Artifact = null,
    ResultResponse? Result = null,
    object? Error = null,
    IReadOnlyDictionary<string, object>? Metadata = null);

public sealed record NormalizedError(
    TruynErrorCode Code,
    string Message,
    bool Retryable,
    IReadOnlyDictionary<string, object>? Source = null);
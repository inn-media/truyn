using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Truyn.Sdk;

/// <summary>C#/.NET client skeleton for the stable TRUYN/1 SDK surface.</summary>
public sealed class TruynClient
{
    public const string Protocol = "TRUYN/1";
    public const string AgentDescriptorSchema = "truyn.agent-descriptor/v1";

    public TruynClient(TruynClientOptions options)
    {
        Options = options ?? throw new ArgumentNullException(nameof(options));
        if (options.BaseUri is null)
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "BaseUri is required", false);
        }
    }

    public TruynClientOptions Options { get; }

    public Task<Identity> GetIdentityAsync(CancellationToken cancellationToken = default) =>
        FailAsync<Identity>("GetIdentityAsync", cancellationToken);

    public Task<AgentDescriptor> GetAgentDescriptorAsync(Uri descriptorUri, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(descriptorUri);
        return FailAsync<AgentDescriptor>("GetAgentDescriptorAsync", cancellationToken);
    }

    public Task<IReadOnlyList<Offer>> DiscoverAsync(string capability, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(capability))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "capability is required", false);
        }
        return FailAsync<IReadOnlyList<Offer>>("DiscoverAsync", cancellationToken);
    }

    public Task<Offer> PublishOfferAsync(Offer offer, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(offer);
        return FailAsync<Offer>("PublishOfferAsync", cancellationToken);
    }

    public Task RevokeOfferAsync(string offerId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(offerId))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "offer ID is required", false);
        }
        return FailAsync<object>("RevokeOfferAsync", cancellationToken);
    }

    public Task<Need> SubmitNeedAsync(Need need, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(need);
        return FailAsync<Need>("SubmitNeedAsync", cancellationToken);
    }

    public Task<ResultResponse> SubmitNeedAsync(NeedRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Capability))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "capability is required", false);
        }
        return FailAsync<ResultResponse>("SubmitNeedRequestAsync", cancellationToken);
    }

    public Task<Result> GetResultAsync(string needId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(needId))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "need ID is required", false);
        }
        return FailAsync<Result>("GetResultAsync", cancellationToken);
    }

    public async IAsyncEnumerable<StreamEvent> StreamResultAsync(string needId, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(needId))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "need ID is required", false);
        }
        cancellationToken.ThrowIfCancellationRequested();
        await Task.FromException(new TruynException(
            TruynErrorCode.Unimplemented,
            "StreamResultAsync is not implemented in the C#/.NET SDK skeleton",
            false));
        yield break;
    }

    public Task CancelAsync(string requestId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(requestId))
        {
            throw new TruynException(TruynErrorCode.InvalidArgument, "request ID is required", false);
        }
        return FailAsync<object>("CancelAsync", cancellationToken);
    }

    private static Task<T> FailAsync<T>(string operation, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return Task.FromCanceled<T>(cancellationToken);
        }

        return Task.FromException<T>(new TruynException(
            TruynErrorCode.Unimplemented,
            operation + " is not implemented in the C#/.NET SDK skeleton",
            false));
    }
}

public sealed record TruynClientOptions(
    Uri BaseUri,
    string? AuthToken = null,
    IReadOnlyList<string>? SupportedProtocols = null,
    TimeSpan? Timeout = null);
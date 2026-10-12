namespace Truyn.Sdk;

public enum TruynErrorCode
{
    VersionMismatch,
    Unauthenticated,
    PermissionDenied,
    DeadlineExceeded,
    InvalidArgument,
    Unimplemented,
    Cancelled,
    Transport,
    InvalidResponse,
    NotFound,
    Conflict,
    ResourceExhausted,
    InternalError
}

public sealed class TruynException : Exception
{
    public TruynException(TruynErrorCode code, string message, bool retryable, Exception? innerException = null)
        : base(message, innerException)
    {
        Code = code;
        Retryable = retryable;
    }

    public TruynErrorCode Code { get; }
    public bool Retryable { get; }

    // Bounded TRUYN/1 mapping; native error IDs remain in their original namespace.
    public static TruynException FromHttp(int status, string? sourceCode, string message)
    {
        var retry = false;
        var code = sourceCode switch
        {
            "version_mismatch" or "unsupported_protocol" or "no_protocol_overlap" or "required_semantic_unavailable" => TruynErrorCode.VersionMismatch,
            "unauthenticated" or "unauthorized" => TruynErrorCode.Unauthenticated,
            "permission_denied" or "authorization_denied" or "provider_access_denied" => TruynErrorCode.PermissionDenied,
            "invalid_argument" or "invalid_request" or "validation_error" or "invalid_capability" => TruynErrorCode.InvalidArgument,
            "unimplemented" => TruynErrorCode.Unimplemented,
            "cancelled" => TruynErrorCode.Cancelled,
            "transport_error" => TruynErrorCode.Transport,
            "invalid_response" => TruynErrorCode.InvalidResponse,
            "not_found" or "no_matching_provider" => TruynErrorCode.NotFound,
            "conflict" or "duplicate_request" => TruynErrorCode.Conflict,
            "resource_exhausted" or "payload_too_large" or "request_too_large" or "offer_capacity_reached" or "node_capacity_reached" or "cancellation_backpressure" or "partial_backpressure" => TruynErrorCode.ResourceExhausted,
            "deadline_exceeded" or "result_wait_timeout" => TruynErrorCode.DeadlineExceeded,
            "internal_error" => TruynErrorCode.InternalError,
            _ => status switch
            {
                401 => TruynErrorCode.Unauthenticated,
                403 => TruynErrorCode.PermissionDenied,
                404 => TruynErrorCode.NotFound,
                408 or 504 => TruynErrorCode.DeadlineExceeded,
                409 => TruynErrorCode.Conflict,
                413 or 429 => TruynErrorCode.ResourceExhausted,
                501 => TruynErrorCode.Unimplemented,
                >= 400 and < 500 => TruynErrorCode.InvalidArgument,
                _ => TruynErrorCode.InternalError
            }
        };
        retry = sourceCode is "transport_error" or "result_wait_timeout"
            or "offer_capacity_reached" or "node_capacity_reached"
            or "cancellation_backpressure" or "partial_backpressure"
            || (string.IsNullOrEmpty(sourceCode) && status is 408 or 504);
        return new TruynException(code, message, retry);
    }
}

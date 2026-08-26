using System;

namespace Truyn.Sdk;

public enum TruynErrorCode
{
    VersionMismatch,
    Unauthenticated,
    PermissionDenied,
    DeadlineExceeded,
    InvalidArgument,
    Unimplemented
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
}

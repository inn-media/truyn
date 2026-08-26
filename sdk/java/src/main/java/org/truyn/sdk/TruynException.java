package org.truyn.sdk;

/** Normalized Java SDK exception surface pinned to the shared error taxonomy. */
public final class TruynException extends RuntimeException {
  public enum Code {
    VERSION_MISMATCH("version_mismatch"),
    UNAUTHENTICATED("unauthenticated"),
    PERMISSION_DENIED("permission_denied"),
    DEADLINE_EXCEEDED("deadline_exceeded"),
    INVALID_ARGUMENT("invalid_argument"),
    UNIMPLEMENTED("unimplemented");

    private final String wireValue;

    Code(String wireValue) {
      this.wireValue = wireValue;
    }

    public String wireValue() {
      return wireValue;
    }
  }

  private final Code code;
  private final boolean retryable;

  public TruynException(Code code, String message, boolean retryable) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }

  public Code code() {
    return code;
  }

  public boolean retryable() {
    return retryable;
  }
}

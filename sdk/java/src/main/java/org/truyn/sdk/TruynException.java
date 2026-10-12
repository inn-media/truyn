package org.truyn.sdk;

public final class TruynException extends RuntimeException {
  public enum Code {
    VERSION_MISMATCH("version_mismatch"), UNAUTHENTICATED("unauthenticated"), PERMISSION_DENIED("permission_denied"),
    DEADLINE_EXCEEDED("deadline_exceeded"), INVALID_ARGUMENT("invalid_argument"), UNIMPLEMENTED("unimplemented"),
    CANCELLED("cancelled"), TRANSPORT("transport_error"), INVALID_RESPONSE("invalid_response"),
    NOT_FOUND("not_found"), CONFLICT("conflict"), RESOURCE_EXHAUSTED("resource_exhausted"), INTERNAL_ERROR("internal_error");
    private final String wireValue; Code(String wireValue){this.wireValue=wireValue;} public String wireValue(){return wireValue;}
  }
  private final Code code; private final boolean retryable;
  public TruynException(Code code,String message,boolean retryable){super(message);this.code=code;this.retryable=retryable;}
  public Code code(){return code;} public boolean retryable(){return retryable;}

  /** Maps modern REST error objects and legacy relay strings without rewriting native protocol classes. */
  public static TruynException fromHttp(int status, String sourceCode, String message) {
    boolean retry = false;
    Code code;
    String source = sourceCode == null ? "" : sourceCode;
    switch (source) {
      case "version_mismatch", "unsupported_protocol", "no_protocol_overlap", "required_semantic_unavailable" -> code = Code.VERSION_MISMATCH;
      case "unauthenticated", "unauthorized" -> code = Code.UNAUTHENTICATED;
      case "permission_denied", "authorization_denied", "provider_access_denied" -> code = Code.PERMISSION_DENIED;
      case "invalid_argument", "invalid_request", "validation_error", "invalid_capability" -> code = Code.INVALID_ARGUMENT;
      case "unimplemented" -> code = Code.UNIMPLEMENTED;
      case "cancelled" -> code = Code.CANCELLED;
      case "transport_error" -> { code = Code.TRANSPORT; retry = true; }
      case "invalid_response" -> code = Code.INVALID_RESPONSE;
      case "not_found", "no_matching_provider" -> code = Code.NOT_FOUND;
      case "conflict", "duplicate_request" -> code = Code.CONFLICT;
      case "resource_exhausted", "payload_too_large", "request_too_large" -> code = Code.RESOURCE_EXHAUSTED;
      case "offer_capacity_reached", "node_capacity_reached", "cancellation_backpressure", "partial_backpressure" -> { code = Code.RESOURCE_EXHAUSTED; retry = true; }
      case "deadline_exceeded" -> code = Code.DEADLINE_EXCEEDED;
      case "result_wait_timeout" -> { code = Code.DEADLINE_EXCEEDED; retry = true; }
      case "internal_error" -> code = Code.INTERNAL_ERROR;
      default -> {
        switch (status) {
          case 401 -> code = Code.UNAUTHENTICATED;
          case 403 -> code = Code.PERMISSION_DENIED;
          case 404 -> code = Code.NOT_FOUND;
          case 408, 504 -> { code = Code.DEADLINE_EXCEEDED; retry = true; }
          case 409 -> code = Code.CONFLICT;
          case 413, 429 -> code = Code.RESOURCE_EXHAUSTED;
          case 501 -> code = Code.UNIMPLEMENTED;
          default -> code = status >= 400 && status < 500 ? Code.INVALID_ARGUMENT : Code.INTERNAL_ERROR;
        }
      }
    }
    return new TruynException(code, message, retry);
  }
}

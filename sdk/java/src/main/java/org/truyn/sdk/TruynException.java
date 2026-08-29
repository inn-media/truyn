package org.truyn.sdk;

public final class TruynException extends RuntimeException {
  public enum Code {
    VERSION_MISMATCH("version_mismatch"), UNAUTHENTICATED("unauthenticated"), PERMISSION_DENIED("permission_denied"),
    DEADLINE_EXCEEDED("deadline_exceeded"), INVALID_ARGUMENT("invalid_argument"), UNIMPLEMENTED("unimplemented"),
    CANCELLED("cancelled"), TRANSPORT("transport_error"), INVALID_RESPONSE("invalid_response");
    private final String wireValue; Code(String wireValue){this.wireValue=wireValue;} public String wireValue(){return wireValue;}
  }
  private final Code code; private final boolean retryable;
  public TruynException(Code code,String message,boolean retryable){super(message);this.code=code;this.retryable=retryable;}
  public Code code(){return code;} public boolean retryable(){return retryable;}
}

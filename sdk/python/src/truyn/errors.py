from __future__ import annotations
from typing import Any, Mapping

_RELAY_MAPPINGS = {
    'unauthenticated': ('unauthenticated', False),
    'permission_denied': ('permission_denied', False),
    'invalid_argument': ('invalid_argument', False),
    'unimplemented': ('unimplemented', False),
    'not_found': ('not_found', False),
    'conflict': ('conflict', False),
    'resource_exhausted': ('resource_exhausted', False),
    'deadline_exceeded': ('deadline_exceeded', False),
    'cancelled': ('cancelled', False),
    'transport_error': ('transport_error', True),
    'invalid_response': ('invalid_response', False),
    'unauthorized': ('unauthenticated', False),
    'invalid_request': ('invalid_argument', False),
    'authorization_denied': ('permission_denied', False),
    'payload_too_large': ('resource_exhausted', False),
    'validation_error': ('invalid_argument', False),
    'version_mismatch': ('version_mismatch', False),
    'provider_access_denied': ('permission_denied', False),
    'no_matching_provider': ('not_found', False),
    'duplicate_request': ('conflict', False),
    'offer_capacity_reached': ('resource_exhausted', True),
    'node_capacity_reached': ('resource_exhausted', True),
    'cancellation_backpressure': ('resource_exhausted', True),
    'partial_backpressure': ('resource_exhausted', True),
    'result_wait_timeout': ('deadline_exceeded', True),
    'invalid_capability': ('invalid_argument', False),
    'internal_error': ('internal_error', False),
}

def _fallback_http(status: int | None) -> tuple[str, bool]:
    if status == 401: return ('unauthenticated', False)
    if status == 403: return ('permission_denied', False)
    if status == 404: return ('not_found', False)
    if status in (408, 504): return ('deadline_exceeded', True)
    if status == 409: return ('conflict', False)
    if status == 429: return ('resource_exhausted', False)
    if status == 413: return ('resource_exhausted', False)
    if status == 501: return ('unimplemented', False)
    if status is not None and status >= 500: return ('internal_error', False)
    if status is not None and status >= 400: return ('invalid_argument', False)
    return ('invalid_response', False)

def normalize_error(source: Mapping[str, Any] | None = None, *, http_status: int | None = None,
                    relay_code: str | None = None, protocol_reason: str | None = None,
                    client_kind: str | None = None, message: str | None = None,
                    details: Any = None, details_present: bool = False) -> dict[str, Any]:
    if source:
        http_status = source.get('httpStatus', http_status)
        relay_code = source.get('relayCode', relay_code)
        protocol_reason = source.get('protocolReason', protocol_reason)
        client_kind = source.get('clientKind', client_kind)
    if protocol_reason in ('unsupported_protocol', 'no_protocol_overlap', 'required_semantic_unavailable'): mapping = ('version_mismatch', False)
    elif client_kind == 'transport': mapping = ('transport_error', True)
    elif client_kind == 'invalid_response': mapping = ('invalid_response', False)
    elif client_kind == 'cancelled': mapping = ('cancelled', False)
    elif relay_code in _RELAY_MAPPINGS: mapping = _RELAY_MAPPINGS[relay_code]
    else: mapping = _fallback_http(http_status)
    raw: dict[str, Any] = {}
    if http_status is not None: raw['httpStatus'] = http_status
    if relay_code: raw['relayCode'] = relay_code
    if protocol_reason: raw['protocolReason'] = protocol_reason
    result: dict[str, Any] = {'code': mapping[0], 'message': message or relay_code or protocol_reason or mapping[0], 'retryable': mapping[1]}
    if raw: result['source'] = raw
    if details_present: result['details'] = details
    return result

class TruynError(Exception):
    def __init__(self, error: Mapping[str, Any]):
        super().__init__(str(error['message']))
        self.code = str(error['code'])
        self.retryable = bool(error['retryable'])
        self.source = error.get('source')
        self.details = error.get('details')

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {'code': self.code, 'message': str(self), 'retryable': self.retryable}
        if self.source is not None: out['source'] = self.source
        if self.details is not None: out['details'] = self.details
        return out

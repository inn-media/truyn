from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from .descriptor import negotiate_agent_descriptor, parse_agent_descriptor, verify_agent_descriptor_signature
from .errors import TruynError, normalize_error

@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes

Transport = Callable[[str, str, Mapping[str, str]], HttpResponse]

def _default_transport(method: str, url: str, headers: Mapping[str, str]) -> HttpResponse:
    request = Request(url, method=method, headers=dict(headers))
    try:
        with urlopen(request, timeout=30) as response:
            return HttpResponse(int(response.status), response.read())
    except HTTPError as error:
        return HttpResponse(int(error.code), error.read())
    except URLError as error:
        raise TruynError(normalize_error(client_kind='transport', message=str(error.reason))) from error
    except OSError as error:
        raise TruynError(normalize_error(client_kind='transport', message=str(error))) from error

def _nonempty(value): return isinstance(value, str) and len(value) > 0
def _plain(value): return isinstance(value, dict)

def _absolute_http_url(value: str, label: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise TruynError({'code': 'validation_error', 'message': f'{label} must be an absolute HTTP(S) URL', 'retryable': False})
    return value.rstrip('/')

def _decode_json(response: HttpResponse, label: str):
    try: value = json.loads(response.body.decode('utf-8'))
    except Exception as error:
        raise TruynError(normalize_error(client_kind='invalid_response', message=f'{label} returned non-JSON response (HTTP {response.status})')) from error
    if not _plain(value):
        raise TruynError(normalize_error(client_kind='invalid_response', message=f'{label} response must be a JSON object'))
    return value

def _validate_identity(value, expected_node_id):
    if not _plain(value) or value.get('nodeId') != expected_node_id or not _nonempty(value.get('publicKey')):
        raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid Identity response'))
    identity = {'nodeId': expected_node_id, 'publicKey': value['publicKey']}
    if value.get('algorithm') is None or _nonempty(value.get('algorithm')): identity['algorithm'] = value.get('algorithm')
    if isinstance(value.get('protocols'), list) and all(_nonempty(item) for item in value['protocols']): identity['protocols'] = list(value['protocols'])
    if value.get('name') is None or _nonempty(value.get('name')): identity['name'] = value.get('name')
    return identity

def _valid_offer(value):
    return (_plain(value) and value.get('protocol') == 'TRUYN/1' and value.get('type') == 'OFFER'
            and _nonempty(value.get('id')) and _nonempty(value.get('from')) and _nonempty(value.get('publicKey'))
            and _nonempty(value.get('signature')) and _plain(value.get('payload'))
            and _plain(value['payload'].get('capability')) and _nonempty(value['payload']['capability'].get('name'))
            and _plain(value['payload'].get('metadata')))

class TruynClient:
    def __init__(self, relay_url: str, *, session_token: str | None = None, transport: Transport | None = None):
        if not _nonempty(relay_url):
            raise TruynError({'code': 'validation_error', 'message': 'relayUrl is required', 'retryable': False})
        self.relay_url = _absolute_http_url(relay_url, 'relayUrl')
        self.session_token = session_token
        self._transport = transport or _default_transport

    def set_session_token(self, session_token: str | None):
        if session_token is not None and not _nonempty(session_token):
            raise TruynError({'code': 'validation_error', 'message': 'sessionToken must be a non-empty string or null', 'retryable': False})
        self.session_token = session_token

    def _authorization(self):
        if not self.session_token:
            raise TruynError({'code': 'unauthenticated', 'message': 'A relay session token is required for this operation', 'retryable': False})
        return f'Bearer {self.session_token}'

    def _request_json(self, path):
        try:
            response = self._transport('GET', self.relay_url + path, {'accept': 'application/json', 'authorization': self._authorization()})
        except TruynError:
            raise
        except Exception as error:
            raise TruynError(normalize_error(client_kind='transport', message=str(error))) from error
        body = _decode_json(response, 'Relay')
        if not 200 <= response.status < 300:
            relay_code = body.get('error') if _nonempty(body.get('error')) else None
            raise TruynError(normalize_error(http_status=response.status, relay_code=relay_code, message=relay_code or f'HTTP {response.status}'))
        return body

    def get_identity(self, node_id: str):
        if not _nonempty(node_id) or not node_id.startswith('truyn:node:'):
            raise TruynError({'code': 'validation_error', 'message': 'nodeId must be a TRUYN node identity', 'retryable': False})
        body = self._request_json('/v1/nodes/' + quote(node_id, safe=''))
        return _validate_identity(body, node_id)

    def discover(self, capability_id: str):
        if not _nonempty(capability_id):
            raise TruynError({'code': 'validation_error', 'message': 'capabilityId is required', 'retryable': False})
        body = self._request_json('/v1/offers?capability=' + quote(capability_id, safe=''))
        offers = body.get('offers')
        if not isinstance(offers, list) or not all(_valid_offer(offer) for offer in offers):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid authorized discovery response'))
        # Provider visibility is a relay policy decision. Never reconstruct or broaden hidden state client-side.
        return offers

    def _descriptor_text(self, url: str):
        try:
            response = self._transport('GET', url, {'accept': 'application/json'})
        except TruynError:
            raise
        except Exception as error:
            raise TruynError(normalize_error(client_kind='transport', message=str(error))) from error
        try: text = response.body.decode('utf-8', errors='strict')
        except UnicodeDecodeError as error:
            raise TruynError(normalize_error(client_kind='invalid_response', message='Descriptor response is not UTF-8')) from error
        if not 200 <= response.status < 300:
            relay_code = None
            try:
                body = json.loads(text)
                if _plain(body) and _nonempty(body.get('error')): relay_code = body['error']
            except Exception:
                pass
            raise TruynError(normalize_error(http_status=response.status, relay_code=relay_code, message=relay_code or f'Descriptor HTTP {response.status}'))
        return text

    def fetch_agent_descriptor(self, url: str, *, public_key_pem: str | None = None, resolve_identity_public_key=None,
                               now=None, allow_expired=False, supported_descriptor_versions=None,
                               supported_protocols=None, supported_interfaces=None):
        descriptor_url = _absolute_http_url(url, 'Agent Descriptor URL')
        input = self._descriptor_text(descriptor_url)
        parsed = parse_agent_descriptor(input, now=now, allow_expired=allow_expired, supported_descriptor_versions=supported_descriptor_versions)
        if not parsed['ok']: raise TruynError(parsed['error'])
        public_key = public_key_pem
        if not public_key and resolve_identity_public_key:
            public_key = resolve_identity_public_key(parsed['descriptor']['identity'])
        if not public_key and self.session_token:
            public_key = self.get_identity(parsed['descriptor']['identity'])['publicKey']
        verified = verify_agent_descriptor_signature(parsed['descriptor'], public_key_pem=public_key, now=now,
                                                     allow_expired=allow_expired,
                                                     supported_descriptor_versions=supported_descriptor_versions)
        if not verified['ok']: raise TruynError(verified['error'])
        negotiated = negotiate_agent_descriptor(verified['descriptor'], now=now, allow_expired=allow_expired,
                                                supported_descriptor_versions=supported_descriptor_versions,
                                                supported_protocols=supported_protocols,
                                                supported_interfaces=supported_interfaces)
        if not negotiated['ok']: raise TruynError(negotiated['error'])
        return {'descriptor': verified['descriptor'], 'selection': negotiated['selection'], 'signer': verified['signer']}

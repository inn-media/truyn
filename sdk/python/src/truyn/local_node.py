from __future__ import annotations

import base64
import json
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .descriptor import canonicalize, node_id_from_public_key
from .errors import TruynError, normalize_error

PROTOCOL = 'TRUYN/1'
MVP_TYPES = ('IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE')


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and len(value) > 0


def _absolute_http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise TruynError({'code': 'validation_error', 'message': 'relayUrl must be an absolute HTTP(S) URL', 'retryable': False})
    return value.rstrip('/')


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


@dataclass(frozen=True)
class LocalIdentity:
    node_id: str
    public_key_pem: str
    private_key_pem: str
    algorithm: str = 'Ed25519'


def create_local_identity() -> LocalIdentity:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    public_key_pem = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')
    private_key_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode('ascii')
    return LocalIdentity(
        node_id=node_id_from_public_key(public_key_pem),
        public_key_pem=public_key_pem,
        private_key_pem=private_key_pem,
    )


def unsigned_envelope(envelope: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in envelope.items() if key != 'signature'}


def create_envelope(
    *,
    type: str,
    identity: LocalIdentity,
    payload: dict[str, Any],
    to: str | None = None,
    id: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    if type not in MVP_TYPES:
        raise ValueError(f'Unsupported MVP message type: {type}')
    if not isinstance(payload, dict):
        raise ValueError('payload must be an object')
    if node_id_from_public_key(identity.public_key_pem) != identity.node_id:
        raise ValueError('Sender node ID does not match the supplied public key')

    unsigned = {
        'protocol': PROTOCOL,
        'type': type,
        'id': id or str(uuid.uuid4()),
        'from': identity.node_id,
        'to': to,
        'createdAt': created_at or _iso_now(),
        'publicKey': identity.public_key_pem,
        'payload': payload,
    }
    private_key = serialization.load_pem_private_key(identity.private_key_pem.encode('ascii'), password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError('identity private key must be Ed25519')
    signature = private_key.sign(canonicalize(unsigned).encode('utf-8'))
    return {**unsigned, 'signature': base64.b64encode(signature).decode('ascii')}


def verify_envelope(envelope: Any, allowed_types: tuple[str, ...] = MVP_TYPES) -> dict[str, Any]:
    if not isinstance(envelope, dict) or envelope.get('protocol') != PROTOCOL:
        return {'ok': False, 'reason': 'unsupported_protocol'}
    if envelope.get('type') not in allowed_types:
        return {'ok': False, 'reason': 'unsupported_type'}
    required = ('id', 'from', 'createdAt', 'publicKey', 'payload', 'signature')
    if any(envelope.get(field) is None or envelope.get(field) == '' for field in required):
        return {'ok': False, 'reason': 'missing_required_field'}
    try:
        if node_id_from_public_key(envelope['publicKey']) != envelope['from']:
            return {'ok': False, 'reason': 'node_id_key_mismatch'}
        public_key = serialization.load_pem_public_key(envelope['publicKey'].encode('ascii'))
        if not isinstance(public_key, Ed25519PublicKey):
            return {'ok': False, 'reason': 'invalid_signature'}
        signature = base64.b64decode(envelope['signature'], validate=True)
        public_key.verify(signature, canonicalize(unsigned_envelope(envelope)).encode('utf-8'))
        return {'ok': True}
    except InvalidSignature:
        return {'ok': False, 'reason': 'invalid_signature'}
    except Exception:
        return {'ok': False, 'reason': 'invalid_signature'}


def _request_json(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    raw_body = None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    request_headers = {'accept': 'application/json', **(headers or {})}
    if raw_body is not None:
        request_headers['content-type'] = 'application/json'
    request = Request(url, data=raw_body, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=30) as response:
            status = int(response.status)
            response_body = response.read()
    except HTTPError as error:
        status = int(error.code)
        response_body = error.read()
    except URLError as error:
        raise TruynError(normalize_error(client_kind='transport', message=str(error.reason))) from error
    except OSError as error:
        raise TruynError(normalize_error(client_kind='transport', message=str(error))) from error

    try:
        decoded = json.loads(response_body.decode('utf-8'))
    except Exception as error:
        raise TruynError(normalize_error(client_kind='invalid_response', message=f'Relay returned non-JSON response (HTTP {status})')) from error
    if not isinstance(decoded, dict):
        raise TruynError(normalize_error(client_kind='invalid_response', message='Relay response must be a JSON object'))
    if not 200 <= status < 300:
        relay_code = decoded.get('error') if _nonempty(decoded.get('error')) else None
        raise TruynError(normalize_error(http_status=status, relay_code=relay_code, message=relay_code or f'HTTP {status}'))
    return decoded


class TruynLocalNodeClient:
    def __init__(self, relay_url: str, identity: LocalIdentity | None = None):
        self.relay_url = _absolute_http_url(relay_url)
        self.identity = identity or create_local_identity()
        self.session_token: str | None = None
        self._pending_events: list[dict[str, Any]] = []

    @classmethod
    def connect(
        cls,
        relay_url: str,
        *,
        name: str | None = None,
        protocols: list[str] | None = None,
        identity: LocalIdentity | None = None,
    ) -> 'TruynLocalNodeClient':
        client = cls(relay_url, identity=identity)
        client._register(name=name, protocols=protocols or ['TRUYN/1'])
        return client

    @property
    def node_id(self) -> str:
        return self.identity.node_id

    def _register(self, *, name: str | None, protocols: list[str]) -> dict[str, Any]:
        envelope = create_envelope(
            type='IDENTITY',
            identity=self.identity,
            payload={
                'nodeId': self.identity.node_id,
                'algorithm': self.identity.algorithm,
                'protocols': protocols,
                'name': name,
            },
        )
        result = _request_json('POST', self.relay_url + '/v1/register', body={'envelope': envelope})
        token = result.get('sessionToken')
        if not _nonempty(token):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid registration response'))
        self.session_token = token
        return result

    def _auth_headers(self) -> dict[str, str]:
        if not self.session_token:
            raise TruynError({'code': 'unauthenticated', 'message': 'A relay session token is required for this operation', 'retryable': False})
        return {'authorization': f'Bearer {self.session_token}'}

    def offer(self, capability_id: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if not _nonempty(capability_id):
            raise TruynError({'code': 'validation_error', 'message': 'capabilityId is required', 'retryable': False})
        envelope = create_envelope(
            type='OFFER',
            identity=self.identity,
            payload={'capability': {'name': capability_id}, 'metadata': metadata or {}},
        )
        return _request_json('POST', self.relay_url + '/v1/offers', body={'envelope': envelope}, headers=self._auth_headers())

    def need(self, capability_id: str, input: Any, policy: dict[str, Any] | None = None) -> dict[str, Any]:
        if not _nonempty(capability_id):
            raise TruynError({'code': 'validation_error', 'message': 'capabilityId is required', 'retryable': False})
        envelope = create_envelope(
            type='NEED',
            identity=self.identity,
            payload={'capability': {'name': capability_id}, 'input': input, 'policy': policy or {}},
        )
        receipt = _request_json('POST', self.relay_url + '/v1/needs', body={'envelope': envelope}, headers=self._auth_headers())
        if not receipt.get('ok') or not _nonempty(receipt.get('needId')) or not _nonempty(receipt.get('provider')):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid NEED receipt'))
        return receipt

    def result(self, request_id: str, output: Any, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if not _nonempty(request_id):
            raise TruynError({'code': 'validation_error', 'message': 'requestId is required', 'retryable': False})
        envelope = create_envelope(
            type='RESULT',
            identity=self.identity,
            payload={
                'requestId': request_id,
                'output': output,
                'completedAt': _iso_now(),
                'metadata': metadata or {},
            },
        )
        return _request_json('POST', self.relay_url + '/v1/results', body={'envelope': envelope}, headers=self._auth_headers())

    def _poll(self) -> list[dict[str, Any]]:
        response = _request_json(
            'GET',
            self.relay_url + '/v1/events?nodeId=' + quote(self.identity.node_id, safe=''),
            headers=self._auth_headers(),
        )
        events = response.get('events')
        if not isinstance(events, list):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid events response'))
        verified: list[dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                raise TruynError(normalize_error(client_kind='invalid_response', message='Relay returned an invalid event'))
            verified.append({**event, 'verification': verify_envelope(event.get('envelope'))})
        return verified

    def _wait_for_event(self, predicate, *, timeout_ms: int = 5000, poll_interval_ms: int = 20) -> dict[str, Any]:
        timeout = max(1, int(timeout_ms))
        interval = max(0, int(poll_interval_ms)) / 1000
        deadline = time.monotonic() + timeout / 1000
        while True:
            for index, event in enumerate(self._pending_events):
                if predicate(event):
                    return self._pending_events.pop(index)
            events = self._poll()
            for index, event in enumerate(events):
                if predicate(event):
                    match = events.pop(index)
                    self._pending_events.extend(events)
                    return match
            self._pending_events.extend(events)
            if time.monotonic() >= deadline:
                raise TruynError({'code': 'deadline_exceeded', 'message': 'Timed out waiting for TRUYN local-node event', 'retryable': True})
            if interval > 0:
                time.sleep(min(interval, max(0, deadline - time.monotonic())))

    def next_need(self, *, timeout_ms: int = 5000, poll_interval_ms: int = 20) -> dict[str, Any]:
        event = self._wait_for_event(lambda candidate: candidate.get('kind') == 'NEED', timeout_ms=timeout_ms, poll_interval_ms=poll_interval_ms)
        verification = event.get('verification') or {}
        if not verification.get('ok'):
            reason = verification.get('reason')
            suffix = f': {reason}' if reason else ''
            raise TruynError(normalize_error(client_kind='invalid_response', message='Received NEED failed signature verification' + suffix))
        envelope = event.get('envelope')
        if not isinstance(envelope, dict):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Received invalid NEED event'))
        payload = envelope.get('payload') if isinstance(envelope.get('payload'), dict) else {}
        capability_value = payload.get('capability')
        capability = capability_value.get('name') if isinstance(capability_value, dict) else capability_value
        if not _nonempty(envelope.get('id')) or not _nonempty(envelope.get('from')) or not _nonempty(capability):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Received invalid NEED event'))
        return {
            'needId': envelope['id'],
            'requester': envelope['from'],
            'capability': capability,
            'input': payload.get('input'),
            'policy': payload.get('policy'),
            'envelope': envelope,
            'verification': verification,
        }

    def wait_for_result(self, need_id: str, *, timeout_ms: int = 5000, poll_interval_ms: int = 20) -> dict[str, Any]:
        if not _nonempty(need_id):
            raise TruynError({'code': 'validation_error', 'message': 'needId is required', 'retryable': False})
        event = self._wait_for_event(
            lambda candidate: candidate.get('kind') == 'RESULT'
            and isinstance(candidate.get('envelope'), dict)
            and isinstance(candidate['envelope'].get('payload'), dict)
            and candidate['envelope']['payload'].get('requestId') == need_id,
            timeout_ms=timeout_ms,
            poll_interval_ms=poll_interval_ms,
        )
        verification = event.get('verification') or {}
        if not verification.get('ok'):
            reason = verification.get('reason')
            suffix = f': {reason}' if reason else ''
            raise TruynError(normalize_error(client_kind='invalid_response', message='Received RESULT failed signature verification' + suffix))
        envelope = event['envelope']
        if not _nonempty(envelope.get('from')):
            raise TruynError(normalize_error(client_kind='invalid_response', message='Received invalid RESULT event'))
        payload = envelope.get('payload') if isinstance(envelope.get('payload'), dict) else {}
        return {
            'needId': need_id,
            'provider': envelope['from'],
            'output': payload.get('output'),
            'metadata': payload.get('metadata'),
            'trust': event.get('trust'),
            'envelope': envelope,
            'verification': verification,
        }

    def close(self) -> None:
        self._pending_events.clear()

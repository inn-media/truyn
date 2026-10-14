"""Native QUIC/UDP five-method TRUYN/1 DHT client.

This is not a Node RPC/HTTP proxy. Requires aioquic with verified TLS;
each bidirectional QUIC stream carries one bounded JSON request/reply.
Signed Ed25519 HELLO/ACCEPT provides Node ID, nonce and session binding.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import secrets
import ssl
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .descriptor import canonicalize, node_id_from_public_key
from .local_node import LocalIdentity, create_local_identity

MAX_MESSAGE_BYTES = 1_048_576
METHODS = frozenset(('dht.ping', 'dht.find-node', 'peer.announce', 'dht.store', 'dht.find-value'))
PROTO = 'truyn-peer-session-v1'


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _digest(value: Any) -> str:
    return _sha(canonicalize(value).encode('utf-8'))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _parse_time(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError('invalid_quic_timestamp')
    instant = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if instant.tzinfo is None:
        raise ValueError('timezone_required')
    return instant


def _sign(identity: LocalIdentity, message: dict[str, Any]) -> str:
    private = serialization.load_pem_private_key(identity.private_key_pem.encode('ascii'), password=None)
    if not isinstance(private, Ed25519PrivateKey):
        raise ValueError('quic_identity_not_ed25519')
    return base64.b64encode(private.sign(canonicalize(message).encode('utf-8'))).decode('ascii')


def _verify(identity: str, public_key: str, signature: str, payload: dict[str, Any]) -> None:
    if node_id_from_public_key(public_key) != identity:
        raise ValueError('quic_signed_record_identity_mismatch')
    key = serialization.load_pem_public_key(public_key.encode('ascii'))
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError('quic_signed_record_key_type')
    key.verify(base64.b64decode(signature, validate=True), canonicalize(payload).encode('utf-8'))


def _record(record: Any, *, peer: bool) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError('quic_invalid_signed_record')
    expected_protocol = 'truyn-peer-record-v1' if peer else 'truyn-kademlia-v1'
    node_field = 'nodeId' if peer else 'publisherNodeId'
    prefix = 'truyn:peer:' if peer else 'truyn:dht:'
    if record.get('protocol') != expected_protocol:
        raise ValueError('quic_signed_record_protocol_mismatch')
    unsigned = {k: v for k, v in record.items() if k not in ('signature', 'publicKey')}
    body = {k: v for k, v in unsigned.items() if k != 'recordId'}
    if record.get('recordId') != prefix + _digest(body):
        raise ValueError('quic_signed_record_id_mismatch')
    _verify(record[node_field], record['publicKey'], record['signature'], unsigned)
    if datetime.now(timezone.utc) >= _parse_time(record.get('expiresAt')):
        raise ValueError('quic_signed_record_expired')
    if peer:
        if record.get('dhtId') != _sha(record['nodeId'].encode('utf-8')):
            raise ValueError('quic_signed_peer_dhtid')
        if not isinstance(record.get('endpoints'), list) or not record['endpoints']:
            raise ValueError('quic_signed_peer_endpoints')
    else:
        if record.get('keyHash') != _sha(f"{record['namespace']}:{record['key']}".encode('utf-8')):
            raise ValueError('quic_signed_dht_key_hash')
        if record.get('valueDigest') != 'sha256:' + _digest(record['value']):
            raise ValueError('quic_signed_dht_value_digest')
    return record


class QuicDhtClient:
    """Authenticated, non-retrying QUIC DHT session. Create via connect_quic_dht."""

    def __init__(self, protocol: Any, identity: LocalIdentity) -> None:
        self._protocol = protocol
        self.identity = identity
        self.node_id = identity.node_id
        self.remote_node_id: str | None = None
        self._session_id: str | None = None

    async def _exchange(self, message: dict[str, Any]) -> dict[str, Any]:
        data = json.dumps(message, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
        if len(data) > MAX_MESSAGE_BYTES:
            raise ValueError('quic_request_too_large')
        reader, writer = await self._protocol.create_stream(is_unidirectional=False)
        writer.write(data)
        writer.write_eof()
        await writer.drain()
        chunks = []
        total = 0
        try:
            while True:
                chunk = await asyncio.wait_for(reader.read(8192), timeout=15)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_MESSAGE_BYTES:
                    raise ValueError('quic_response_too_large')
                chunks.append(chunk)
        finally:
            writer.close()
        if not chunks:
            raise ValueError('empty_quic_response')
        result = json.loads(b''.join(chunks))
        if not isinstance(result, dict):
            raise ValueError('invalid_quic_response')
        return result

    async def authenticate(self, expected_node_id: str | None = None) -> None:
        nonce = base64.urlsafe_b64encode(secrets.token_bytes(24)).decode('ascii').rstrip('=')
        body = {
            'protocol': PROTO, 'kind': 'HELLO', 'nodeId': self.node_id,
            'transport': 'quic', 'endpoints': [], 'nonce': nonce,
            'issuedAt': _now(), 'protocols': ['TRUYN/1'],
            'semantics': [], 'requiredSemantics': []
        }
        hello = {**body, 'publicKey': self.identity.public_key_pem,
                 'signature': _sign(self.identity, body)}
        response = await self._exchange({'kind': 'session-hello', 'hello': hello})
        if response.get('ok') is not True:
            raise ValueError('quic_handshake_rejected:' + str(response.get('error')))
        accept = response.get('accept')
        if not isinstance(accept, dict):
            raise ValueError('quic_accept_missing')
        public_key, signature, peer = accept.get('publicKey'), accept.get('signature'), accept.get('nodeId')
        if not all(isinstance(x, str) for x in (public_key, signature, peer)):
            raise ValueError('quic_accept_identity_missing')
        signed = {k: v for k, v in accept.items() if k not in ('signature', 'publicKey')}
        _verify(peer, public_key, signature, signed)
        hello_digest = _digest({k: v for k, v in hello.items() if k != 'signature'})
        binding = 'quic:hello:' + hello_digest
        if (accept.get('protocol') != PROTO or accept.get('kind') != 'ACCEPT' or
                accept.get('peerNodeId') != self.node_id or accept.get('helloNonce') != nonce or
                accept.get('helloDigest') != hello_digest or accept.get('transportBinding') != binding or
                accept.get('transport') != 'quic' or accept.get('negotiatedProtocol') != 'TRUYN/1' or
                accept.get('negotiatedSemantics') != [] or
                'TRUYN/1' not in accept.get('supportedProtocols', [])):
            raise ValueError('quic_accept_binding_or_negotiation_mismatch')
        if abs((datetime.now(timezone.utc) - _parse_time(accept.get('issuedAt'))).total_seconds()) > 30:
            raise ValueError('quic_accept_expired')
        if expected_node_id and expected_node_id != peer:
            raise ValueError('quic_unexpected_peer_node_id')
        computed = 'truyn:session:' + _digest({
            'helloNodeId': self.node_id, 'acceptNodeId': peer,
            'helloNonce': nonce, 'acceptNonce': accept['nonce'], 'transportBinding': binding
        })
        if response.get('sessionId') != computed:
            raise ValueError('quic_session_id_mismatch')
        self.remote_node_id = peer
        self._session_id = computed

    async def _rpc(self, method: str, payload: Any = None) -> dict[str, Any]:
        if method not in METHODS:
            raise ValueError('unsupported_quic_dht_method')
        if not self._session_id:
            raise ValueError('quic_authentication_required')
        result = await self._exchange({'kind': 'control', 'sessionId': self._session_id,
                                       'method': method, 'payload': payload})
        if result.get('ok') is not True:
            raise ValueError('quic_control_rejected:' + str(result.get('error')))
        if not isinstance(result.get('result'), dict):
            raise ValueError('quic_control_result_invalid')
        return result['result']

    async def ping(self) -> bool:
        result = await self._rpc('dht.ping')
        if result.get('pong') is not True or result.get('nodeId') != self.remote_node_id:
            raise ValueError('quic_ping_wrong_peer')
        if isinstance(result.get('peerRecord'), dict):
            _record(result['peerRecord'], peer=True)
        return True

    async def find_node(self, target_node_id: str) -> list[dict[str, Any]]:
        if not isinstance(target_node_id, str) or not target_node_id:
            raise ValueError('target_node_id_required')
        result = await self._rpc('dht.find-node', {'targetNodeId': target_node_id})
        records = result.get('records')
        if not isinstance(records, list) or len(records) > 256:
            raise ValueError('quic_peer_set_invalid')
        return [_record(record, peer=True) for record in records]

    async def announce(self, endpoints: list[str], sequence: int = 1) -> dict[str, Any]:
        endpoints = sorted(set(endpoints))
        if not endpoints or any(not isinstance(x, str) or not x.strip() for x in endpoints) or sequence < 1:
            raise ValueError('invalid_peer_announcement')
        issued = datetime.now(timezone.utc)
        body = {
            'protocol': 'truyn-peer-record-v1', 'nodeId': self.node_id,
            'dhtId': _sha(self.node_id.encode('utf-8')), 'endpoints': endpoints,
            'capabilities': [], 'nat': None, 'sequence': sequence,
            'issuedAt': issued.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'expiresAt': (issued + timedelta(minutes=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        }
        signed = {'recordId': 'truyn:peer:' + _digest(body), **body}
        record = {**signed, 'publicKey': self.identity.public_key_pem,
                  'signature': _sign(self.identity, signed)}
        result = await self._rpc('peer.announce', {'record': record})
        if result.get('accepted') is not True or result.get('nodeId') != self.node_id:
            raise ValueError('invalid_peer_announce_receipt')
        return result

    async def store(self, namespace: str, key: str, value: Any, sequence: int = 1) -> dict[str, Any]:
        if not namespace or not key or sequence < 1:
            raise ValueError('invalid_dht_store')
        issued = datetime.now(timezone.utc)
        body = {
            'protocol': 'truyn-kademlia-v1',
            'namespace': namespace, 'key': key,
            'keyHash': _sha(f'{namespace}:{key}'.encode('utf-8')),
            'value': value, 'valueDigest': 'sha256:' + _digest(value),
            'publisherNodeId': self.node_id, 'sequence': sequence,
            'issuedAt': issued.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'expiresAt': (issued + timedelta(minutes=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        }
        signed = {'recordId': 'truyn:dht:' + _digest(body), **body}
        record = {**signed, 'publicKey': self.identity.public_key_pem,
                  'signature': _sign(self.identity, signed)}
        result = await self._rpc('dht.store', {'record': record})
        if result.get('stored') is not True or result.get('recordId') != signed['recordId']:
            raise ValueError('invalid_dht_store_receipt')
        return result

    async def find_value(self, namespace: str, key: str) -> list[dict[str, Any]]:
        if not namespace or not key:
            raise ValueError('dht_query_required')
        result = await self._rpc('dht.find-value', {'namespace': namespace, 'key': key})
        records = result.get('records')
        if not isinstance(records, list) or len(records) > 256:
            raise ValueError('invalid_signed_dht_record_set')
        return [_record(record, peer=False) for record in records]


@asynccontextmanager
async def connect_quic_dht(host: str, port: int, *, ca_file: str,
                           expected_node_id: str | None = None,
                           identity: LocalIdentity | None = None) -> AsyncIterator[QuicDhtClient]:
    """Require a CA bundle and native aioquic; never disable certificate checks."""
    if not ca_file:
        raise ValueError('quic_tls_ca_required')
    try:
        from aioquic.asyncio.client import connect
        from aioquic.quic.configuration import QuicConfiguration
    except ImportError as exc:
        raise RuntimeError('Install truyn-sdk[quic] on Python >=3.11') from exc
    config = QuicConfiguration(is_client=True, alpn_protocols=['truyn/1'])
    config.verify_mode = ssl.CERT_REQUIRED
    config.load_verify_locations(cafile=ca_file)
    async with connect(host, port, configuration=config) as protocol:
        session = QuicDhtClient(protocol, identity or create_local_identity())
        await session.authenticate(expected_node_id)
        yield session

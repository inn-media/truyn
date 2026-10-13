"""Native direct compact lifecycle. No retry, signer substitution or production grant."""
from __future__ import annotations
import base64
import secrets
from typing import Any
from urllib.parse import quote
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from .descriptor import canonicalize, node_id_from_public_key
from .errors import TruynError


def invalid(message: str) -> TruynError:
    return TruynError({'code': 'invalid_response', 'message': message, 'retryable': False})


class CompactLifecycle:
    """Mixin for the existing local-node identity and authenticated transport."""
    def _compact_send(self, path: str, code: str, request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        from .local_node import _request_json
        if not isinstance(request_id, str) or not request_id or len(request_id) > 4070 or code not in ('N', 'R', 'T', 'C', 'P', 'D'):
            raise ValueError('invalid direct compact identity or kind')
        if node_id_from_public_key(self.identity.public_key_pem) != self.node_id:
            raise ValueError('compact identity key mismatch')
        key = serialization.load_pem_private_key(self.identity.private_key_pem.encode('ascii'), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError('Ed25519 identity required')
        signature = key.sign(canonicalize([code, request_id, payload]).encode('utf-8'))
        frame = {'t': code, 'i': request_id, 's': base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}
        return _request_json('POST', self.relay_url + path, body={'frame': frame, 'payload': payload}, headers=self._auth_headers())

    def compact_need(self, capability_id: str, input: Any, policy: dict[str, Any] | None = None) -> dict[str, Any]:
        if not isinstance(capability_id, str) or not capability_id:
            raise ValueError('capability_id required')
        request_id = secrets.token_urlsafe(12)
        receipt = self._compact_send('/v1/fast/needs?waitMs=0', 'N', request_id, {'capability': {'name': capability_id}, 'input': input, 'policy': policy or {}})
        if receipt.get('ok') is not True or receipt.get('needId') != request_id:
            raise invalid('invalid compact NEED receipt')
        return receipt

    def partial(self, request_id: str, sequence: int, delta: Any, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if isinstance(sequence, bool) or not isinstance(sequence, int) or not 0 <= sequence <= 9007199254740991:
            raise ValueError('sequence must be a non-negative safe integer')
        return self._compact_send('/v1/fast/partials', 'T', request_id, {'sequence': sequence, 'delta': delta, 'metadata': metadata or {}})

    def compact_result(self, request_id: str, output: Any, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._compact_send('/v1/fast/results', 'R', request_id, {'output': output, 'metadata': metadata or {}})

    def compact_chain(self, stages: list[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(stages, list) or not 2 <= len(stages) <= 8:
            raise ValueError('invalid_chain_stages')
        return self._compact_send('/v1/fast/chains', 'C', secrets.token_urlsafe(12), {'stages': stages})

    def put_context(self, blocks: list[dict[str, Any]], readers: list[str] | None = None,
                    metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if not isinstance(blocks, list) or not blocks:
            raise ValueError('context_blocks_required')
        receipt = self._compact_send('/v1/contexts', 'P', secrets.token_urlsafe(12),
                                     {'blocks': blocks, 'readers': readers or [], 'metadata': metadata or {}})
        if receipt.get('ok') is not True or not isinstance(receipt.get('cid'), str):
            raise invalid('invalid context PUT receipt')
        return receipt

    def delta_context(self, base_cid: str, ops: list[dict[str, Any]], readers: list[str] | None = None,
                      metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if not isinstance(base_cid, str) or not base_cid or not isinstance(ops, list) or not ops:
            raise ValueError('invalid_context_delta')
        receipt = self._compact_send('/v1/contexts/' + quote(base_cid, safe='') + '/delta',
                                     'D', secrets.token_urlsafe(12),
                                     {'baseCid': base_cid, 'ops': ops, 'readers': readers or [],
                                      'metadata': metadata or {}})
        if receipt.get('ok') is not True or receipt.get('baseCid') != base_cid or not isinstance(receipt.get('cid'), str):
            raise invalid('invalid context DELTA receipt')
        return receipt

    def cancel_need(self, need_id: str, reason: str = 'cancelled_by_requester') -> dict[str, Any]:
        return self._revoke_lifecycle(need_id, 'need', reason)

    def revoke_offer(self, offer_id: str, reason: str = 'revoked_by_owner') -> dict[str, Any]:
        return self._revoke_lifecycle(offer_id, 'offer', reason)

    def _revoke_lifecycle(self, target_id: str, target_kind: str, reason: str) -> dict[str, Any]:
        from .local_node import create_envelope, _request_json
        if not isinstance(target_id, str) or not target_id:
            raise ValueError('target_id is required')
        envelope = create_envelope(type='REVOKE', identity=self.identity, payload={'targetId': target_id, 'targetKind': target_kind, 'reason': reason})
        return _request_json('POST', self.relay_url + '/v1/revoke', body={'envelope': envelope}, headers=self._auth_headers())

    def poll_compact(self) -> list[dict[str, Any]]:
        from .local_node import _request_json, verify_envelope
        result = _request_json('GET', self.relay_url + '/v1/fast/events?nodeId=' + quote(self.node_id, safe='') + '&waitMs=0', headers=self._auth_headers())
        events = result.get('events')
        if not isinstance(events, list) or len(events) > 1024:
            raise invalid('invalid compact events')
        verified = []
        for event in events:
            if not isinstance(event, dict):
                raise invalid('invalid compact event')
            kind = event.get('kind')
            if 'envelope' in event:
                envelope = event['envelope']
                if not isinstance(envelope, dict) or envelope.get('type') != kind or not verify_envelope(envelope).get('ok'):
                    raise invalid('invalid signed lifecycle envelope')
                verified.append({**event, 'verification': {'ok': True}})
                continue
            chain_stage = kind == 'CHAIN_STAGE'
            code = 'C' if chain_stage else {'NEED': 'N', 'RESULT': 'R', 'PARTIAL': 'T'}.get(kind)
            frame, payload, signer = event.get('frame'), event.get('payload'), event.get('from')
            if not code or not isinstance(frame, dict) or frame.get('t') != code or not isinstance(payload, dict) or not isinstance(signer, str) or not signer:
                raise invalid('invalid direct compact event')
            if chain_stage:
                stages, index = payload.get('stages'), event.get('stageIndex')
                if (event.get('signedType') != 'CHAIN' or not isinstance(stages, list) or
                        not 2 <= len(stages) <= 8 or isinstance(index, bool) or
                        not isinstance(index, int) or not 0 <= index < len(stages) or
                        event.get('requestId') != str(frame.get('i', ''))[:15] + str(index)):
                    raise invalid('CHAIN_STAGE unsigned correlation or signed profile mismatch')
            elif event.get('signedType', kind) != kind or 'priorResult' in event:
                raise invalid('compact translation unsupported')
            request_id, text = frame.get('i'), frame.get('s')
            if not isinstance(request_id, str) or not request_id or len(request_id) > 4070 or not isinstance(text, str) or len(text) != 86:
                raise invalid('invalid compact signature shape')
            try:
                signature = base64.b64decode(text + '==', altchars=b'-_', validate=True)
                if len(signature) != 64 or base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=') != text:
                    raise ValueError('noncanonical signature')
                record = _request_json('GET', self.relay_url + '/v1/nodes/' + quote(signer, safe=''), headers=self._auth_headers())
                pem = record.get('publicKey', '')
                if record.get('nodeId') != signer or node_id_from_public_key(pem) != signer:
                    raise ValueError('identity mismatch')
                key = serialization.load_pem_public_key(pem.encode('ascii'))
                if not isinstance(key, Ed25519PublicKey):
                    raise ValueError('not Ed25519')
                key.verify(signature, canonicalize([code, request_id, payload]).encode('utf-8'))
            except Exception as error:
                raise invalid('compact signature or identity verification failed') from error
            prior_verification = None
            if chain_stage:
                prior = event.get('priorResult')
                if index == 0 and prior is not None:
                    raise invalid('unexpected first CHAIN_STAGE prior')
                if index > 0:
                    if not isinstance(prior, dict) or prior.get('kind') != 'RESULT':
                        raise invalid('missing signed prior CHAIN result')
                    pf, pp, sender = prior.get('frame'), prior.get('payload'), prior.get('from')
                    if (not isinstance(pf, dict) or pf.get('t') != 'R' or
                            pf.get('i') != str(frame['i'])[:15] + str(index - 1) or
                            not isinstance(pp, dict) or not isinstance(sender, str)):
                        raise invalid('invalid prior CHAIN result shape')
                    try:
                        text = pf['s']
                        sig = base64.b64decode(text + '==', altchars=b'-_', validate=True)
                        if len(sig) != 64 or base64.urlsafe_b64encode(sig).decode('ascii').rstrip('=') != text:
                            raise ValueError('prior result signature not canonical')
                        signer = _request_json('GET', self.relay_url + '/v1/nodes/' + quote(sender, safe=''),
                                               headers=self._auth_headers())
                        pem = signer.get('publicKey', '')
                        if signer.get('nodeId') != sender or node_id_from_public_key(pem) != sender:
                            raise ValueError('prior result signer mismatch')
                        key = serialization.load_pem_public_key(pem.encode('ascii'))
                        if not isinstance(key, Ed25519PublicKey):
                            raise ValueError('prior result signer not Ed25519')
                        key.verify(sig, canonicalize(['R', pf['i'], pp]).encode('utf-8'))
                    except Exception as error:
                        raise invalid('prior CHAIN result crypto verification failed') from error
                    prior_verification = {'ok': True, 'type': 'RESULT'}
            if kind == 'PARTIAL':
                sequence = payload.get('sequence')
                if isinstance(sequence, bool) or not isinstance(sequence, int) or not 0 <= sequence <= 9007199254740991 or 'delta' not in payload:
                    raise invalid('invalid signed PARTIAL payload')
            verified.append({**event, 'verification': {'ok': True, 'type': 'CHAIN' if chain_stage else kind}, 'priorVerification': prior_verification})
        return verified

from __future__ import annotations
import base64
import hashlib
import json
from datetime import datetime, timezone
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

AGENT_DESCRIPTOR_SCHEMA = 'truyn.agent-descriptor/v1'
AGENT_DESCRIPTOR_VERSION = '1'
DEFAULT_SUPPORTED_PROTOCOLS = ('TRUYN/1',)
DEFAULT_SUPPORTED_INTERFACES = ('https', 'websocket', 'truyn-quic', 'mcp')

def _failure(code, reason, message, details=None, source=None):
    error = {'code': code, 'message': message, 'retryable': False}
    if source: error['source'] = source
    if details is not None: error['details'] = details
    return {'ok': False, 'reason': reason, 'error': error}

def _nonempty(value): return isinstance(value, str) and len(value) > 0
def _plain(value): return isinstance(value, dict)
def _str_array(value, min_items=0): return isinstance(value, list) and len(value) >= min_items and all(_nonempty(item) for item in value) and len(set(value)) == len(value)

def _valid_interface(value):
    if not _plain(value) or not _nonempty(value.get('type')): return False
    if 'endpoint' in value and not _nonempty(value['endpoint']): return False
    if 'version' in value and not _nonempty(value['version']): return False
    if 'contentTypes' in value and not _str_array(value['contentTypes']): return False
    return True

def _valid_capability(value):
    if not _plain(value) or not _nonempty(value.get('id')): return False
    return all(field not in value or _str_array(value[field]) for field in ('inputModes', 'outputModes', 'interactionModes'))

def _parse_time(value):
    if not _nonempty(value): return None
    try:
        text = value[:-1] + '+00:00' if value.endswith('Z') else value
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None: parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp() * 1000
    except ValueError:
        return None

def _now_ms(value):
    if value is None: return datetime.now(timezone.utc).timestamp() * 1000
    if isinstance(value, (int, float)): return float(value)
    if isinstance(value, datetime):
        parsed = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return parsed.timestamp() * 1000
    return _parse_time(value)

def _signatures(descriptor):
    values = []
    if _nonempty(descriptor.get('signature')): values.append(descriptor['signature'])
    if isinstance(descriptor.get('signatures'), list): values.extend(descriptor['signatures'])
    return list(dict.fromkeys(values))

def _signature_bytes(value):
    if not _nonempty(value): return None
    try: raw = base64.b64decode(value, validate=True)
    except Exception: return None
    return raw if len(raw) == 64 and base64.b64encode(raw).decode() == value else None

def _normalize(value):
    if isinstance(value, list): return [_normalize(item) for item in value]
    if isinstance(value, dict): return {key: _normalize(value[key]) for key in sorted(value)}
    return value

def canonicalize(value):
    return json.dumps(_normalize(value), ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def unsigned_agent_descriptor(descriptor):
    return {key: value for key, value in descriptor.items() if key not in ('signature', 'signatures')}

def agent_descriptor_signing_payload(descriptor):
    if not _plain(descriptor): raise TypeError('descriptor must be an object')
    return canonicalize(unsigned_agent_descriptor(descriptor))

def node_id_from_public_key(public_key_pem):
    raw = public_key_pem.encode() if isinstance(public_key_pem, str) else public_key_pem
    key = serialization.load_pem_public_key(raw)
    der = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return 'truyn:node:' + hashlib.sha256(der).hexdigest()

def parse_agent_descriptor(input, *, now=None, allow_expired=False, supported_descriptor_versions=None):
    versions = list(supported_descriptor_versions or [AGENT_DESCRIPTOR_VERSION])
    if isinstance(input, (str, bytes, bytearray)):
        try: descriptor = json.loads(input.decode() if not isinstance(input, str) else input)
        except Exception: return _failure('validation_error', 'invalid_descriptor_json', 'Agent Descriptor is not valid JSON')
    elif _plain(input): descriptor = input
    else: return _failure('validation_error', 'invalid_descriptor_type', 'Agent Descriptor must be a JSON object or JSON document')
    if not _plain(descriptor): return _failure('validation_error', 'invalid_descriptor_type', 'Agent Descriptor must be a JSON object')
    if not _nonempty(descriptor.get('descriptorVersion')): return _failure('validation_error', 'missing_descriptor_version', 'Agent Descriptor descriptorVersion is required')
    if descriptor['descriptorVersion'] not in versions: return _failure('version_mismatch', 'unsupported_descriptor_version', 'Unsupported Agent Descriptor version', {'supportedDescriptorVersions': versions, 'receivedDescriptorVersion': descriptor['descriptorVersion']})
    if descriptor.get('schema') != AGENT_DESCRIPTOR_SCHEMA: return _failure('version_mismatch', 'unsupported_descriptor_schema', 'Unsupported Agent Descriptor schema', {'supportedSchema': AGENT_DESCRIPTOR_SCHEMA, 'receivedSchema': descriptor.get('schema')})
    if not _nonempty(descriptor.get('identity')) or not descriptor['identity'].startswith('truyn:node:'): return _failure('validation_error', 'invalid_descriptor_identity', 'Agent Descriptor identity must be a TRUYN node identity')
    if not _str_array(descriptor.get('protocols'), 1): return _failure('validation_error', 'invalid_descriptor_protocols', 'Agent Descriptor protocols must be a non-empty unique string array')
    if not isinstance(descriptor.get('interfaces'), list) or not descriptor['interfaces'] or not all(_valid_interface(value) for value in descriptor['interfaces']): return _failure('validation_error', 'invalid_descriptor_interfaces', 'Agent Descriptor interfaces are invalid')
    if not isinstance(descriptor.get('capabilities'), list) or not all(_valid_capability(value) for value in descriptor['capabilities']): return _failure('validation_error', 'invalid_descriptor_capabilities', 'Agent Descriptor capabilities are invalid')
    issued_at = _parse_time(descriptor.get('issuedAt'))
    expires_at = _parse_time(descriptor.get('expiresAt'))
    if issued_at is None: return _failure('validation_error', 'invalid_descriptor_issued_at', 'Agent Descriptor issuedAt must be a valid date-time')
    if expires_at is None: return _failure('validation_error', 'invalid_descriptor_expires_at', 'Agent Descriptor expiresAt must be a valid date-time')
    if expires_at <= issued_at: return _failure('validation_error', 'invalid_descriptor_time_window', 'Agent Descriptor expiresAt must be after issuedAt')
    current = _now_ms(now)
    if current is None: return _failure('validation_error', 'invalid_validation_time', 'Descriptor validation time is invalid')
    if not allow_expired and expires_at <= current: return _failure('validation_error', 'descriptor_expired', 'Agent Descriptor has expired', {'expiresAt': descriptor['expiresAt']})
    signatures = _signatures(descriptor)
    if not signatures or any(_signature_bytes(value) is None for value in signatures): return _failure('validation_error', 'invalid_descriptor_signature_encoding', 'Agent Descriptor requires a base64 Ed25519 signature')
    return {'ok': True, 'descriptor': descriptor}

def negotiate_agent_descriptor(input, *, now=None, allow_expired=False, supported_descriptor_versions=None, supported_protocols=None, supported_interfaces=None):
    versions = list(supported_descriptor_versions or [AGENT_DESCRIPTOR_VERSION])
    protocols = list(supported_protocols or DEFAULT_SUPPORTED_PROTOCOLS)
    interfaces = list(supported_interfaces or DEFAULT_SUPPORTED_INTERFACES)
    parsed = parse_agent_descriptor(input, now=now, allow_expired=allow_expired, supported_descriptor_versions=versions)
    if not parsed['ok']: return parsed
    descriptor = parsed['descriptor']
    protocol = next((candidate for candidate in protocols if candidate in descriptor['protocols']), None)
    if not protocol: return _failure('version_mismatch', 'unsupported_protocol', 'No mutually supported TRUYN protocol generation', {'supportedProtocols': protocols, 'advertisedProtocols': descriptor['protocols']}, {'protocolReason': 'unsupported_protocol'})
    selected = next((entry for entry in descriptor['interfaces'] if entry['type'] in interfaces), None)
    if not selected: return _failure('version_mismatch', 'unsupported_interface', 'No mutually supported Agent Descriptor interface', {'supportedInterfaces': interfaces, 'advertisedInterfaces': [entry['type'] for entry in descriptor['interfaces']]})
    return {'ok': True, 'descriptor': descriptor, 'selection': {'descriptorVersion': descriptor['descriptorVersion'], 'protocol': protocol, 'interface': selected}}

def verify_agent_descriptor_signature(input, *, public_key_pem=None, now=None, allow_expired=False, supported_descriptor_versions=None):
    parsed = parse_agent_descriptor(input, now=now, allow_expired=allow_expired, supported_descriptor_versions=supported_descriptor_versions)
    if not parsed['ok']: return parsed
    descriptor = parsed['descriptor']
    if not _nonempty(public_key_pem): return _failure('unauthenticated', 'descriptor_key_unavailable', 'Agent Descriptor identity public key is unavailable')
    try:
        raw = public_key_pem.encode() if isinstance(public_key_pem, str) else public_key_pem
        key = serialization.load_pem_public_key(raw)
        resolved = node_id_from_public_key(public_key_pem)
    except Exception:
        return _failure('unauthenticated', 'invalid_descriptor_public_key', 'Agent Descriptor identity public key is invalid')
    if not isinstance(key, Ed25519PublicKey): return _failure('unauthenticated', 'invalid_descriptor_public_key', 'Agent Descriptor identity public key is invalid')
    if resolved != descriptor['identity']: return _failure('unauthenticated', 'descriptor_identity_key_mismatch', 'Agent Descriptor signing key is not the current identity key', {'expectedIdentity': descriptor['identity'], 'resolvedIdentity': resolved, 'delegatedDescriptorKeysSupported': False})
    payload = agent_descriptor_signing_payload(descriptor).encode()
    for encoded in _signatures(descriptor):
        signature = _signature_bytes(encoded)
        if signature is None: continue
        try:
            key.verify(signature, payload)
            return {'ok': True, 'descriptor': descriptor, 'signer': {'identity': descriptor['identity'], 'keyBinding': 'identity'}}
        except InvalidSignature:
            pass
        except Exception:
            return _failure('unauthenticated', 'invalid_descriptor_public_key', 'Agent Descriptor identity public key is invalid')
    return _failure('unauthenticated', 'invalid_descriptor_signature', 'Agent Descriptor signature verification failed')

"""Opt-in truyn.envelope.ext/1 validation, after native Ed25519 verification."""
import json
import re
from datetime import datetime, timezone
import math
import time

ENVELOPE_EXT_SEMANTIC = 'truyn.envelope.ext/1'
KNOWN = {'traceId', 'expiresAt', 'priority', 'contentType', 'crit'}
NAME = r'[A-Za-z][A-Za-z0-9]{0,31}'
VALUE = r'[A-Za-z0-9._:;=/+\-]{1,128}'

def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None

def validate_envelope_ext(envelope, *, negotiated_semantics=(), now=None):
    if ENVELOPE_EXT_SEMANTIC not in negotiated_semantics or 'ext' not in envelope:
        return {'ok': True}
    def fail(reason, detail): return {'ok': False, 'reason': reason, 'detail': detail}
    ext = envelope['ext']
    if not isinstance(ext, dict) or len(ext) > 16:
        return fail('invalid_argument', 'invalid_ext')
    for key, value in ext.items():
        if not matches(NAME, key): return fail('invalid_argument', 'invalid_ext')
        if key == 'crit':
            if (not isinstance(value, list) or len(value) > 16 or
                any(not matches(NAME, k) or k == 'crit' or k not in ext for k in value) or
                len(set(value)) != len(value)):
                return fail('invalid_argument', 'invalid_ext:crit')
        elif not matches(VALUE, value): return fail('invalid_argument', 'invalid_ext:' + key)
    if len(json.dumps(ext, separators=(',', ':')).encode('ascii')) > 1024:
        return fail('invalid_argument', 'invalid_ext')
    if 'traceId' in ext and (not matches(r'[0-9a-f]{32}', ext['traceId']) or ext['traceId'] == '0'*32):
        return fail('invalid_argument', 'invalid_ext:traceId')
    expires = None
    if 'expiresAt' in ext:
        try:
            if not matches(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', ext['expiresAt']): raise ValueError()
            expires = datetime.fromisoformat(ext['expiresAt'].replace('Z', '+00:00')).timestamp()*1000
            created = datetime.fromisoformat(envelope['createdAt'].replace('Z', '+00:00')).timestamp()*1000
            if expires <= created: raise ValueError()
        except (ValueError, KeyError, TypeError): return fail('invalid_argument', 'invalid_ext:expiresAt')
    if 'priority' in ext and ext['priority'] not in ('background', 'normal', 'critical'):
        return fail('invalid_argument', 'invalid_ext:priority')
    if 'contentType' in ext and not matches(r'application/json(?:;profile=[a-z0-9][a-z0-9._/\-]{0,95})?', ext['contentType']):
        return fail('invalid_argument', 'invalid_ext:contentType')
    for key in ext.get('crit', []):
        if key not in KNOWN: return fail('version_mismatch', 'required_semantic_unavailable:' + key)
    clock = time.time()*1000 if now is None else now
    if not isinstance(clock, (int, float)) or not math.isfinite(clock): return fail('invalid_argument', 'invalid_ext:clock')
    if expires is not None and clock > expires + 30000: return fail('deadline_exceeded', 'envelope_expired')
    if ext.get('contentType', 'application/json') not in ('application/json', 'application/json;profile=truyn.' + envelope['type'].lower() + '/1'):
        return fail('unimplemented', 'unsupported_content_type')
    return {'ok': True}

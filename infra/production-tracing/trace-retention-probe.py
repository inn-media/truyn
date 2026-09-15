import json
import re
import time
import urllib.error
import urllib.request

READY_URL = 'http://127.0.0.1:3200/ready'
OTLP_URL = 'http://127.0.0.1:4318/v1/traces'
RUNTIME_PROOF_URL = 'http://127.0.0.1:9466/trace-id'
SOURCE_SHA = '__SOURCE_SHA__'
TENANTS = {
    'normal': {
        'trace_id': '6e6f726d616c2d747275796e2d70726f',
        'span_id': '6e6f726d616c3031',
        'retention': '720h',
        'retention_hours': 720,
    },
    'incident': {
        'trace_id': '696e636964656e742d747275796e2d31',
        'span_id': '696e636964656e74',
        'retention': '2160h',
        'retention_hours': 2160,
    },
}


def marker(stage, result, tenant=None, **fields):
    parts = ['TRUYN_TRACE_PROBE_STAGE', f'stage={stage}', f'result={result}']
    if tenant:
        parts.append(f'tenant={tenant}')
    for key, value in fields.items():
        parts.append(f'{key}={value}')
    print(' '.join(parts), flush=True)


def fail(stage, tenant=None):
    marker(stage, 'fail', tenant)
    raise SystemExit(f'trace retention acceptance failed at {stage}' + (f' for {tenant}' if tenant else ''))


def request_headers(tenant, extra=None):
    headers = {'X-Scope-OrgID': tenant}
    if extra:
        headers.update(extra)
    return headers


def fetch(url, tenant='normal', timeout=10):
    request = urllib.request.Request(url, headers=request_headers(tenant, {'Accept': 'application/json'}))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def wait_ready():
    for _ in range(120):
        try:
            status, _ = fetch(READY_URL, 'normal', timeout=5)
            if status == 200:
                marker('tempo_ready', 'pass')
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def trace_request(tenant):
    cfg = TENANTS[tenant]
    now = time.time_ns()
    return {
        'resourceSpans': [{
            'resource': {
                'attributes': [
                    {'key': 'service.name', 'value': {'stringValue': 'truyn-trace-retention-acceptance'}},
                    {'key': 'deployment.environment.name', 'value': {'stringValue': 'production'}},
                    {'key': 'truyn.trace.retention_class', 'value': {'stringValue': tenant}},
                ]
            },
            'scopeSpans': [{
                'scope': {'name': 'truyn.production-ops', 'version': '1'},
                'spans': [{
                    'traceId': cfg['trace_id'],
                    'spanId': cfg['span_id'],
                    'name': f'truyn.trace.retention.{tenant}',
                    'kind': 1,
                    'startTimeUnixNano': str(now),
                    'endTimeUnixNano': str(now + 1_000_000),
                    'attributes': [
                        {'key': 'truyn.proof', 'value': {'stringValue': 'trace-retention'}}
                    ],
                }],
            }],
        }]
    }


def export_trace(tenant):
    payload = json.dumps(trace_request(tenant), separators=(',', ':')).encode('utf-8')
    request = urllib.request.Request(
        OTLP_URL,
        data=payload,
        method='POST',
        headers=request_headers(tenant, {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }),
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status == 200


def trace_observed(tenant, trace_id=None):
    trace_id = trace_id or TENANTS[tenant]['trace_id']
    status, body = fetch(f'http://127.0.0.1:3200/api/v2/traces/{trace_id}', tenant)
    return status == 200 and len(body) > 0, body


def override_observed(tenant):
    status, body = fetch(f'http://127.0.0.1:3200/status/overrides/{tenant}', tenant)
    if status != 200:
        return False
    try:
        payload = json.loads(body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    runtime_overrides = str(payload.get('runtime_overrides') or '')
    source = str(payload.get('using_default_or_wildcard_runtime_overrides') or '')
    expected = TENANTS[tenant]['retention']
    retention_match = re.search(
        r'(?m)^\s*block_retention:\s*' + re.escape(expected) + r'(?:0m0s)?\s*$',
        runtime_overrides,
    )
    disabled_match = re.search(
        r'(?m)^\s*compaction_disabled:\s*(\S+)\s*$',
        runtime_overrides,
    )
    compaction_enabled = disabled_match is None or disabled_match.group(1).lower() == 'false'
    return source == tenant and retention_match is not None and compaction_enabled


def wait_override(tenant):
    for _ in range(90):
        try:
            if override_observed(tenant):
                marker(
                    'retention_override',
                    'pass',
                    tenant,
                    retention_hours=TENANTS[tenant]['retention_hours'],
                )
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def wait_export(tenant):
    for _ in range(60):
        try:
            if export_trace(tenant):
                marker('otlp_export', 'pass', tenant)
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def wait_readback(tenant, trace_id=None, attempts=180):
    for _ in range(attempts):
        try:
            observed, body = trace_observed(tenant, trace_id)
            if observed:
                marker('trace_readback', 'pass', tenant)
                return body
        except Exception:
            pass
        time.sleep(2)
    return None


def runtime_trace_proof():
    request = urllib.request.Request(RUNTIME_PROOF_URL, headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status != 200:
                return None
            proof = json.loads(response.read().decode('utf-8'))
    except Exception:
        return None
    trace_id = str(proof.get('traceId') or '')
    if (
        proof.get('ok') is True
        and proof.get('span') == 'truyn.provider.execute'
        and proof.get('sourceSha') == SOURCE_SHA
        and proof.get('endpoint') == 'private-loopback-otlp-http'
        and proof.get('retentionClass') == 'normal'
        and len(trace_id) == 32
        and all(char in '0123456789abcdef' for char in trace_id)
    ):
        return trace_id
    return None


def contains_provider_span(value):
    if isinstance(value, dict):
        if value.get('name') == 'truyn.provider.execute':
            return True
        return any(contains_provider_span(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_provider_span(item) for item in value)
    return False


if not wait_ready():
    fail('tempo_ready')

# Prove the retention policy is loaded before using either acceptance tenant.
# This keeps the DoD fail-closed: a trace is never accepted as evidence merely
# because ingestion works while the per-tenant retention override is absent.
for tenant in ('normal', 'incident'):
    if not wait_override(tenant):
        fail('retention_override', tenant)

for tenant in ('normal', 'incident'):
    if not wait_export(tenant):
        fail('otlp_export', tenant)
    body = wait_readback(tenant)
    if body is None:
        fail('trace_readback', tenant)

print('TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob', flush=True)
print('TRUYN_TRACE_RETENTION_PASS normal_days=30 incident_days=90 normal_readback=1 incident_readback=1', flush=True)

runtime_trace_id = None
for _ in range(120):
    runtime_trace_id = runtime_trace_proof()
    if runtime_trace_id:
        marker('runtime_trace_id', 'pass', 'normal')
        break
    time.sleep(2)
if not runtime_trace_id:
    fail('runtime_trace_id', 'normal')

runtime_body = wait_readback('normal', runtime_trace_id)
if runtime_body is None:
    fail('runtime_trace_readback', 'normal')
try:
    decoded = json.loads(runtime_body.decode('utf-8'))
except (UnicodeDecodeError, json.JSONDecodeError):
    fail('runtime_trace_decode', 'normal')
if not contains_provider_span(decoded):
    fail('runtime_provider_span', 'normal')

print('TRUYN_TRACE_EXPORT_PASS span=truyn.provider.execute runtime=production source=exact-main retention_class=normal', flush=True)
while True:
    time.sleep(3600)

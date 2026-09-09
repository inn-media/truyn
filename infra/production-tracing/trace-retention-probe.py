import json
import time
import urllib.error
import urllib.request

from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import AnyValue, InstrumentationScope, KeyValue
from opentelemetry.proto.resource.v1.resource_pb2 import Resource
from opentelemetry.proto.trace.v1.trace_pb2 import ResourceSpans, ScopeSpans, Span

READY_URL = 'http://127.0.0.1:3200/ready'
OTLP_URL = 'http://127.0.0.1:4318/v1/traces'
RUNTIME_PROOF_URL = 'http://127.0.0.1:9466/trace-id'
SOURCE_SHA = '__SOURCE_SHA__'
TENANTS = {
    'normal': {
        'trace_id': '6e6f726d616c2d747275796e2d70726f',
        'span_id': '6e6f726d616c3031',
        'retention': '720h',
    },
    'incident': {
        'trace_id': '696e636964656e742d747275796e2d31',
        'span_id': '696e636964656e74',
        'retention': '2160h',
    },
}


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
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def trace_request(tenant):
    cfg = TENANTS[tenant]
    now = time.time_ns()
    resource = Resource(attributes=[
        KeyValue(key='service.name', value=AnyValue(string_value='truyn-trace-retention-acceptance')),
        KeyValue(key='deployment.environment.name', value=AnyValue(string_value='production')),
        KeyValue(key='truyn.trace.retention_class', value=AnyValue(string_value=tenant)),
    ])
    span = Span(
        trace_id=bytes.fromhex(cfg['trace_id']),
        span_id=bytes.fromhex(cfg['span_id']),
        name=f'truyn.trace.retention.{tenant}',
        kind=1,
        start_time_unix_nano=now,
        end_time_unix_nano=now + 1_000_000,
        attributes=[KeyValue(key='truyn.proof', value=AnyValue(string_value='trace-retention'))],
    )
    scope = ScopeSpans(
        scope=InstrumentationScope(name='truyn.production-ops', version='1'),
        spans=[span],
    )
    return ExportTraceServiceRequest(resource_spans=[ResourceSpans(resource=resource, scope_spans=[scope])])


def export_trace(tenant):
    payload = trace_request(tenant).SerializeToString()
    request = urllib.request.Request(
        OTLP_URL,
        data=payload,
        method='POST',
        headers=request_headers(tenant, {'Content-Type': 'application/x-protobuf'}),
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status == 200


def trace_observed(tenant, trace_id=None):
    trace_id = trace_id or TENANTS[tenant]['trace_id']
    status, body = fetch(f'http://127.0.0.1:3200/api/v2/traces/{trace_id}', tenant)
    return status == 200 and len(body) > 0, body


def override_observed(tenant):
    status, body = fetch(f'http://127.0.0.1:3200/status/overrides/{tenant}', tenant)
    text = body.decode('utf-8', errors='replace')
    return status == 200 and 'block_retention' in text and TENANTS[tenant]['retention'] in text


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
    raise SystemExit('Tempo readiness timed out')

for tenant in ('normal', 'incident'):
    accepted = False
    for _ in range(60):
        try:
            if export_trace(tenant):
                accepted = True
                break
        except Exception:
            pass
        time.sleep(2)
    if not accepted:
        raise SystemExit(f'{tenant} OTLP/HTTP trace export timed out')

    observed = False
    for _ in range(180):
        try:
            observed, _ = trace_observed(tenant)
            if observed:
                break
        except Exception:
            pass
        time.sleep(2)
    if not observed:
        raise SystemExit(f'{tenant} trace read-back timed out')

for tenant in ('normal', 'incident'):
    if not override_observed(tenant):
        raise SystemExit(f'{tenant} retention override was not active')

print('TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob', flush=True)
print('TRUYN_TRACE_RETENTION_PASS normal_days=30 incident_days=90 normal_readback=1 incident_readback=1', flush=True)

runtime_trace_id = None
for _ in range(120):
    runtime_trace_id = runtime_trace_proof()
    if runtime_trace_id:
        break
    time.sleep(2)
if not runtime_trace_id:
    raise SystemExit('production runtime trace export proof did not expose an exact normal-retention trace id')

runtime_observed = False
for _ in range(180):
    try:
        observed, body = trace_observed('normal', runtime_trace_id)
        if observed:
            decoded = json.loads(body.decode('utf-8'))
            if contains_provider_span(decoded):
                runtime_observed = True
                break
    except Exception:
        pass
    time.sleep(2)
if not runtime_observed:
    raise SystemExit('truyn.provider.execute normal-retention trace was not returned by Tempo')

print('TRUYN_TRACE_EXPORT_PASS span=truyn.provider.execute runtime=production source=exact-main retention_class=normal', flush=True)
while True:
    time.sleep(3600)

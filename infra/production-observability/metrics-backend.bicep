targetScope = 'resourceGroup'

@description('Opaque deterministic Container App name supplied by the deployment workflow.')
param appName string

@description('Existing internal production Container Apps environment resource ID.')
param environmentId string

@description('Production region inherited from the selected DR foundation.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
param sourceSha string

@allowed([
  'v1.151.0'
])
param victoriaMetricsVersion string = 'v1.151.0'

var probeScript = '''
set -eu
python -m pip install --disable-pip-version-check --no-cache-dir --quiet python-snappy==0.7.3
python - <<'PY'
import json
import struct
import time
import urllib.parse
import urllib.request

import snappy

WRITE_URL = 'http://127.0.0.1:8428/api/v1/write'
QUERY_BASE = 'http://127.0.0.1:8428/api/v1/query'
QUERY = 'truyn_backend_acceptance_series{surface="production-ops",proof="metrics-backend"}'


def varint(value):
    out = bytearray()
    while True:
        byte = value & 0x7f
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def key(field, wire):
    return varint((field << 3) | wire)


def string_field(field, value):
    raw = value.encode('utf-8')
    return key(field, 2) + varint(len(raw)) + raw


def message_field(field, raw):
    return key(field, 2) + varint(len(raw)) + raw


def label(name, value):
    return string_field(1, name) + string_field(2, value)


def sample(value, timestamp_ms):
    return key(1, 1) + struct.pack('<d', value) + key(2, 0) + varint(timestamp_ms)


def request_bytes():
    labels = [
        ('__name__', 'truyn_backend_acceptance_series'),
        ('proof', 'metrics-backend'),
        ('surface', 'production-ops'),
    ]
    timeseries = b''.join(message_field(1, label(name, value)) for name, value in labels)
    timeseries += message_field(2, sample(1.0, int(time.time() * 1000)))
    return snappy.compress(message_field(1, timeseries))


def remote_write():
    body = request_bytes()
    request = urllib.request.Request(
        WRITE_URL,
        data=body,
        method='POST',
        headers={
            'Content-Encoding': 'snappy',
            'Content-Type': 'application/x-protobuf',
            'X-Prometheus-Remote-Write-Version': '0.1.0',
        },
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status in (200, 204)


def query_back():
    url = QUERY_BASE + '?' + urllib.parse.urlencode({'query': QUERY})
    with urllib.request.urlopen(url, timeout=5) as response:
        if response.status != 200:
            return False
        body = json.loads(response.read().decode('utf-8'))
    result = body.get('data', {}).get('result', [])
    return body.get('status') == 'success' and any(
        float(item.get('value', [0, 0])[1]) == 1.0 for item in result
    )


write_ok = False
for _ in range(120):
    try:
        if remote_write():
            write_ok = True
            break
    except Exception:
        pass
    time.sleep(2)

if not write_ok:
    raise SystemExit('remote-write acceptance timed out')

query_ok = False
for _ in range(120):
    try:
        if query_back():
            query_ok = True
            break
    except Exception:
        pass
    time.sleep(2)

if not query_ok:
    raise SystemExit('PromQL read-back timed out')

print('TRUYN_METRICS_CANARY_PASS remote_write=accepted promql=observed', flush=True)
while True:
    time.sleep(3600)
PY
'''

resource metricsBackend 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  tags: {
    component: 'production-metrics-backend'
    deploymentId: deploymentId
    sourceSha: sourceSha
    managedBy: 'truyn-production-operations-plane'
    backend: 'victoriametrics'
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      containers: [
        {
          name: 'victoriametrics'
          image: 'victoriametrics/victoria-metrics:${victoriaMetricsVersion}'
          args: [
            '-storageDataPath=/victoria-metrics-data'
            '-httpListenAddr=:8428'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
        {
          name: 'acceptance-probe'
          image: 'python:3.12.11-slim-bookworm'
          command: [
            'sh'
            '-c'
          ]
          args: [
            probeScript
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output appId string = metricsBackend.id

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

@description('Private Prometheus remote-write endpoint inside the production Container Apps environment.')
param backendWriteUrl string

@description('Private Prometheus query base URL inside the production Container Apps environment.')
param backendQueryBase string

@allowed([
  'https://relay.truyn.org/health'
])
param publicTarget string = 'https://relay.truyn.org/health'

@allowed([
  '0.158.0'
])
param collectorVersion string = '0.158.0'

var collectorConfig = '''
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: truyn-relay-public
          scrape_interval: 1m
          scrape_timeout: 20s
          metrics_path: /probe
          scheme: http
          static_configs:
            - targets: ["127.0.0.1:9115"]
              labels:
                environment: "production"
                deployment: "${deploymentId}"
                service: "truyn-relay"
                probe_class: "public-http-edge"

exporters:
  prometheusremotewrite:
    endpoint: "${backendWriteUrl}"
    retry_on_failure:
      enabled: true
    sending_queue:
      enabled: true

service:
  pipelines:
    metrics:
      receivers: [prometheus]
      exporters: [prometheusremotewrite]
'''

var publicProbeScript = '''
set -eu
python - <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.error
import urllib.request

TARGET = '${publicTarget}'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        return

    def do_GET(self):
        if self.path.split('?', 1)[0] != '/probe':
            self.send_response(404)
            self.end_headers()
            return

        status_code = 0
        cf_ray = 0
        success = 0
        try:
            request = urllib.request.Request(
                TARGET,
                headers={'User-Agent': 'truyn-production-public-http-probe/1'},
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                status_code = int(response.status)
                cf_ray = 1 if response.headers.get('CF-Ray') else 0
                success = 1 if status_code == 200 and cf_ray == 1 else 0
        except urllib.error.HTTPError as error:
            status_code = int(error.code)
            cf_ray = 1 if error.headers and error.headers.get('CF-Ray') else 0
        except Exception:
            pass

        body = (
            '# HELP probe_success Whether the public TRUYN relay edge probe succeeded.\n'
            '# TYPE probe_success gauge\n'
            f'probe_success {success}\n'
            '# HELP probe_http_status_code HTTP status returned by the public TRUYN relay edge.\n'
            '# TYPE probe_http_status_code gauge\n'
            f'probe_http_status_code {status_code}\n'
            '# HELP probe_edge_marker Whether the expected Cloudflare edge marker was observed.\n'
            '# TYPE probe_edge_marker gauge\n'
            f'probe_edge_marker{{marker="cf-ray"}} {cf_ray}\n'
        ).encode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(('127.0.0.1', 9115), Handler).serve_forever()
PY
'''

var acceptanceScript = '''
set -eu
python - <<'PY'
import json
import time
import urllib.parse
import urllib.request

QUERY_BASE = '${backendQueryBase}'
DEPLOYMENT = '${deploymentId}'
START = int(time.time())
COMMON = f'job="truyn-relay-public",deployment="{DEPLOYMENT}",probe_class="public-http-edge"'
SUCCESS_QUERY = f'probe_success{{{COMMON}}}'
STATUS_QUERY = f'probe_http_status_code{{{COMMON}}}'
EDGE_QUERY = f'probe_edge_marker{{{COMMON},marker="cf-ray"}}'


def query_range(expression):
    params = urllib.parse.urlencode({
        'query': expression,
        'start': START,
        'end': int(time.time()),
        'step': 60,
    })
    request = urllib.request.Request(
        QUERY_BASE + '/api/v1/query_range?' + params,
        headers={'User-Agent': 'truyn-production-public-http-probe-acceptance/1'},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status != 200:
            return []
        body = json.loads(response.read().decode('utf-8'))
    if body.get('status') != 'success':
        return []
    values = []
    for series in body.get('data', {}).get('result', []):
        for timestamp, value in series.get('values', []):
            if int(float(timestamp)) >= START:
                values.append(float(value))
    return values

accepted = False
for _ in range(36):
    try:
        success_values = query_range(SUCCESS_QUERY)
        status_values = query_range(STATUS_QUERY)
        edge_values = query_range(EDGE_QUERY)
        if (
            len(success_values) >= 2 and
            len(status_values) >= 2 and
            len(edge_values) >= 2 and
            all(value == 1.0 for value in success_values[-2:]) and
            all(value == 200.0 for value in status_values[-2:]) and
            all(value == 1.0 for value in edge_values[-2:])
        ):
            accepted = True
            break
    except Exception:
        pass
    time.sleep(10)

if not accepted:
    raise SystemExit('public HTTP edge probe did not produce two successful one-minute backend samples')

print('TRUYN_PUBLIC_HTTP_PROBE_PASS job=truyn-relay-public interval=1m http=200 cf_ray=1 samples=2plus', flush=True)
while True:
    time.sleep(3600)
PY
'''

resource publicProbe 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  tags: {
    component: 'production-public-http-probe'
    deploymentId: deploymentId
    sourceSha: sourceSha
    managedBy: 'truyn-production-operations-plane'
    probeJob: 'truyn-relay-public'
    probeInterval: '1m'
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
          name: 'public-http-probe'
          image: 'python:3.12.11-slim-bookworm'
          command: [
            'sh'
            '-c'
          ]
          args: [
            publicProbeScript
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
        {
          name: 'metrics-collector'
          image: 'otel/opentelemetry-collector-contrib:${collectorVersion}'
          args: [
            '--config=env:OTEL_CONFIG'
          ]
          env: [
            { name: 'OTEL_CONFIG', value: collectorConfig }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
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
            acceptanceScript
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

output appId string = publicProbe.id
output jobName string = 'truyn-relay-public'
output scrapeInterval string = '1m'
output target string = publicTarget

targetScope = 'resourceGroup'

@description('Opaque deterministic relay Container App name.')
param appName string

@description('Existing internal production Container Apps environment resource ID.')
param environmentId string

@description('Production region inherited from the selected DR foundation.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
param sourceSha string

@description('Existing production Azure Container Registry name.')
param registryName string

@description('Exact-main relay image URI built by the deployment workflow.')
param relayImage string

@description('Private Prometheus remote-write endpoint inside the production Container Apps environment.')
param backendWriteUrl string

@description('Private Prometheus query endpoint inside the production Container Apps environment.')
param backendQueryUrl string

@allowed([
  '0.158.0'
])
param collectorVersion string = '0.158.0'

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var regionIdentityByLocation = {
  germanywestcentral: 'region-9f2d7c41'
  northeurope: 'region-4b81a6e3'
}
var regionIdentity = contains(regionIdentityByLocation, location) ? regionIdentityByLocation[location] : 'region-unmapped'

var collectorConfigTemplate = '''
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: truyn-production-relay
          scrape_interval: 5s
          scrape_timeout: 4s
          static_configs:
            - targets: ["127.0.0.1:9464"]
              labels:
                environment: "production"
                deployment: "${deploymentId}"
                service: "truyn-relay"
                region: "${regionIdentity}"

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

// Compatibility-safe expansion of exact, private runtime endpoints and identity.
// Bare Bicep multi-line strings are literal: they do not interpolate \${...}.
var collectorConfig = replace(
  replace(
    replace(collectorConfigTemplate, '\${backendWriteUrl}', backendWriteUrl),
    '\${deploymentId}', deploymentId
  ),
  '\${regionIdentity}', regionIdentity
)

var acceptanceScriptTemplate = '''
set -eu
python - <<'PY'
import json
import time
import urllib.error
import urllib.parse
import urllib.request

RELAY_HTTP = 'http://127.0.0.1:8080'
RELAY_METRICS = 'http://127.0.0.1:9464/metrics'
QUERY_BASE = '${backendQueryUrl}'
IDENTITY = {
    'environment': 'production',
    'deployment': '${deploymentId}',
    'service': 'truyn-relay',
    'region': '${regionIdentity}',
}
FORBIDDEN_LABELS = {'requestId', 'providerId', 'nodeId'}
SERIES_SELECTOR = ','.join(f'{key}="{value}"' for key, value in IDENTITY.items())
REQUIRED = [
    ('truyn_http_requests_total{surface="relay",' + SERIES_SELECTOR + '}', False),
    ('truyn_dispatch_attempts_total{' + SERIES_SELECTOR + '}', False),
    ('truyn_result_delivery_total{' + SERIES_SELECTOR + '}', False),
    ('truyn_runtime_ready{role="relay",' + SERIES_SELECTOR + '}', True),
]


def fetch(url, timeout=5):
    request = urllib.request.Request(url, headers={'User-Agent': 'truyn-production-metrics-acceptance/1'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode('utf-8', errors='replace')


def query_visible(expression, require_one=False):
    url = QUERY_BASE + '?' + urllib.parse.urlencode({'query': expression})
    status, raw = fetch(url)
    if status != 200:
        return False
    try:
        body = json.loads(raw)
        result = body.get('data', {}).get('result', [])
    except Exception:
        return False
    if body.get('status') != 'success' or not result:
        return False
    for item in result:
        labels = item.get('metric', {})
        if any(labels.get(key) != value for key, value in IDENTITY.items()):
            return False
        if any(label in labels for label in FORBIDDEN_LABELS):
            return False
    if not require_one:
        return True
    for item in result:
        try:
            if float(item.get('value', [0, 0])[1]) == 1.0:
                return True
        except Exception:
            pass
    return False


print('TRUYN_METRICS_PROBE_STAGE stage=loopback_wait', flush=True)
metrics_ready = False
for _ in range(120):
    try:
        status, body = fetch(RELAY_METRICS)
        if status == 200 and 'truyn_runtime_ready' in body:
            metrics_ready = True
            break
    except Exception:
        pass
    time.sleep(2)

if not metrics_ready:
    print('TRUYN_METRICS_PROBE_STAGE stage=loopback_unready', flush=True)
    raise SystemExit('loopback /metrics never became ready')
print('TRUYN_METRICS_PROBE_STAGE stage=loopback_ready', flush=True)

# Generate bounded acceptance traffic through the real relay HTTP server.
# Error responses still exercise the HTTP, dispatch and RESULT metric paths.
for _ in range(3):
    for path in ('/', '/v1/needs', '/v1/results'):
        try:
            fetch(RELAY_HTTP + path)
        except Exception:
            pass
    time.sleep(1)

local_names = {
    'truyn_http_requests_total': False,
    'truyn_dispatch_attempts_total': False,
    'truyn_result_delivery_total': False,
    'truyn_runtime_ready': False,
}
for _ in range(60):
    try:
        status, body = fetch(RELAY_METRICS)
        if status == 200:
            for name in local_names:
                local_names[name] = name in body
            if all(local_names.values()):
                break
    except Exception:
        pass
    time.sleep(2)

if not all(local_names.values()):
    print('TRUYN_METRICS_PROBE_STAGE stage=local_families_missing', flush=True)
    raise SystemExit('required metrics are not present on loopback /metrics')
print('TRUYN_METRICS_PROBE_STAGE stage=local_families_ready', flush=True)

seen = [False] * len(REQUIRED)
print('TRUYN_METRICS_PROBE_STAGE stage=remote_readback_wait', flush=True)
for attempt in range(180):
    for index, (expression, require_one) in enumerate(REQUIRED):
        if seen[index]:
            continue
        try:
            seen[index] = query_visible(expression, require_one=require_one)
        except Exception:
            pass
    if all(seen):
        break
    if attempt % 30 == 29:
        progress = ''.join('1' if found else '0' for found in seen)
        print('TRUYN_METRICS_PROBE_STAGE stage=remote_readback_progress observed=' + progress, flush=True)
    time.sleep(5)

if not all(seen):
    progress = ''.join('1' if found else '0' for found in seen)
    print('TRUYN_METRICS_PROBE_STAGE stage=remote_readback_missing observed=' + progress, flush=True)
    missing = [REQUIRED[index][0] for index, value in enumerate(seen) if not value]
    raise SystemExit('backend did not expose required production relay metrics with safe identity labels: ' + ','.join(missing))

print('TRUYN_METRICS_COLLECTOR_PASS http=1 dispatch=1 result=1 ready=1 loopback=1 remote_write=1 identity=1 forbidden=0', flush=True)
while True:
    time.sleep(3600)
PY
'''

var acceptanceScript = replace(
  replace(
    replace(acceptanceScriptTemplate, '\${backendQueryUrl}', backendQueryUrl),
    '\${deploymentId}', deploymentId
  ),
  '\${regionIdentity}', regionIdentity
)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource relayIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-mi'
  location: location
  tags: {
    component: 'production-metrics-collector'
    deploymentId: deploymentId
    sourceSha: sourceSha
    managedBy: 'truyn-production-operations-plane'
  }
}

var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)

resource relayRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, relayIdentity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: relayIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource relayCollector 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  tags: {
    component: 'production-metrics-collector'
    deploymentId: deploymentId
    sourceSha: sourceSha
    managedBy: 'truyn-production-operations-plane'
    collector: 'otelcol-contrib'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${relayIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registry.properties.loginServer
          identity: relayIdentity.id
        }
      ]
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      containers: [
        {
          name: 'relay'
          image: relayImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'TRUYN_ROLE', value: 'relay' }
            { name: 'TRUYN_OBSERVABILITY', value: '1' }
            { name: 'TRUYN_METRICS_HOST', value: '127.0.0.1' }
            { name: 'TRUYN_METRICS_PORT', value: '9464' }
            { name: 'OTEL_SERVICE_NAME', value: 'truyn-relay' }
            { name: 'HOST', value: '0.0.0.0' }
            { name: 'PORT', value: '8080' }
            { name: 'TRUYN_PUBLIC_NETWORK', value: '0' }
            { name: 'TRUYN_ALLOW_PUBLIC_REGISTRATION', value: '0' }
            { name: 'TRUYN_ALLOW_PUBLIC_DISPATCH', value: '0' }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
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
  dependsOn: [
    relayRegistryPull
  ]
}

output appId string = relayCollector.id
output relayMetricsHost string = '127.0.0.1'
output relayMetricsPort int = 9464
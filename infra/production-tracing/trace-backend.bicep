targetScope = 'resourceGroup'

@description('Opaque deterministic Container App name supplied by the deployment workflow.')
param appName string

@description('Opaque deterministic storage account name supplied by the deployment workflow.')
@minLength(3)
@maxLength(24)
param storageAccountName string

@description('Opaque deterministic managed identity name supplied by the deployment workflow.')
param identityName string

@description('Existing internal production Container Apps environment resource ID.')
param environmentId string

@description('Existing production VNet resource ID used for private Blob DNS resolution.')
param vnetId string

@description('Existing production private-endpoint subnet resource ID.')
param privateEndpointSubnetId string

@description('Existing production Azure Container Registry name.')
param registryName string

@description('Exact immutable trace-backend image built from sourceSha.')
param imageName string

@description('Exact immutable TRUYN production runtime image built from sourceSha.')
param runtimeImage string

@description('Production region inherited from the selected DR foundation.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
@minLength(40)
@maxLength(40)
param sourceSha string

@allowed([
  '3.0.2'
])
param tempoVersion string = '3.0.2'

var traceContainerName = 'traces'
var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var blobPrivateDnsZoneName = 'privatelink.blob.core.windows.net'
var tags = {
  component: 'production-trace-backend'
  deploymentId: deploymentId
  sourceSha: sourceSha
  managedBy: 'truyn-production-operations-plane'
  backend: 'tempo'
  backendVersion: tempoVersion
}

var probeScript = '''
set -eu
python -m pip install --disable-pip-version-check --no-cache-dir --quiet opentelemetry-proto==1.44.0
python - <<'PY'
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
TRACE_ID_HEX = '6f70656e61692d747275796e2d70726f'
SPAN_ID_HEX = '747275796e6f7073'
QUERY_URL = f'http://127.0.0.1:3200/api/v2/traces/{TRACE_ID_HEX}'
RUNTIME_PROOF_URL = 'http://127.0.0.1:9466/trace-id'
SOURCE_SHA = '${sourceSha}'


def fetch(url, timeout=10):
    request = urllib.request.Request(url, headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def wait_ready():
    for _ in range(120):
        try:
            with urllib.request.urlopen(READY_URL, timeout=5) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


def trace_request():
    now = time.time_ns()
    resource = Resource(attributes=[
        KeyValue(key='service.name', value=AnyValue(string_value='truyn-trace-backend-acceptance')),
        KeyValue(key='deployment.environment.name', value=AnyValue(string_value='production')),
    ])
    span = Span(
        trace_id=bytes.fromhex(TRACE_ID_HEX),
        span_id=bytes.fromhex(SPAN_ID_HEX),
        name='truyn.trace.backend.acceptance',
        kind=1,
        start_time_unix_nano=now,
        end_time_unix_nano=now + 1_000_000,
        attributes=[KeyValue(key='truyn.proof', value=AnyValue(string_value='trace-backend'))],
    )
    scope = ScopeSpans(
        scope=InstrumentationScope(name='truyn.production-ops', version='1'),
        spans=[span],
    )
    return ExportTraceServiceRequest(resource_spans=[ResourceSpans(resource=resource, scope_spans=[scope])])


def export_trace():
    payload = trace_request().SerializeToString()
    request = urllib.request.Request(
        OTLP_URL,
        data=payload,
        method='POST',
        headers={'Content-Type': 'application/x-protobuf'},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status == 200


def trace_observed():
    status, body = fetch(QUERY_URL)
    return status == 200 and len(body) > 0


def runtime_trace_proof():
    status, body = fetch(RUNTIME_PROOF_URL, timeout=5)
    if status != 200:
        return None
    try:
        proof = json.loads(body.decode('utf-8'))
    except Exception:
        return None
    trace_id = str(proof.get('traceId') or '')
    if (
        proof.get('ok') is True
        and proof.get('span') == 'truyn.provider.execute'
        and proof.get('sourceSha') == SOURCE_SHA
        and proof.get('endpoint') == 'private-loopback-otlp-http'
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


def runtime_trace_observed(trace_id):
    status, body = fetch(f'http://127.0.0.1:3200/api/v2/traces/{trace_id}')
    if status != 200:
        return False
    try:
        decoded = json.loads(body.decode('utf-8'))
    except Exception:
        return False
    return contains_provider_span(decoded)


if not wait_ready():
    raise SystemExit('Tempo readiness timed out')

accepted = False
for _ in range(60):
    try:
        if export_trace():
            accepted = True
            break
    except Exception:
        pass
    time.sleep(2)

if not accepted:
    raise SystemExit('OTLP/HTTP trace export timed out')

observed = False
for _ in range(180):
    try:
        if trace_observed():
            observed = True
            break
    except Exception:
        pass
    time.sleep(2)

if not observed:
    raise SystemExit('Tempo trace read-back timed out')

print('TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob', flush=True)

runtime_trace_id = None
for _ in range(120):
    try:
        runtime_trace_id = runtime_trace_proof()
        if runtime_trace_id:
            break
    except Exception:
        pass
    time.sleep(2)

if not runtime_trace_id:
    raise SystemExit('production runtime trace export proof did not expose an exact trace id')

runtime_observed = False
for _ in range(180):
    try:
        if runtime_trace_observed(runtime_trace_id):
            runtime_observed = True
            break
    except Exception:
        pass
    time.sleep(2)

if not runtime_observed:
    raise SystemExit('truyn.provider.execute trace was not returned by Tempo')

print('TRUYN_TRACE_EXPORT_PASS span=truyn.provider.execute runtime=production source=exact-main', flush=True)
while True:
    time.sleep(3600)
PY
'''

resource traceIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource traceStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: traceStorage
  name: 'default'
}

resource traceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: traceContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource blobPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: blobPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource blobPrivateDnsVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobPrivateDns
  name: guid(traceStorage.id, vnetId)
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

resource blobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${appName}-blob-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: {
          privateLinkServiceId: traceStorage.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource blobPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: blobPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobPrivateDns.id
        }
      }
    ]
  }
}

var blobDataContributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
resource traceBlobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(traceStorage.id, traceIdentity.id, blobDataContributorRoleId)
  scope: traceStorage
  properties: {
    roleDefinitionId: blobDataContributorRoleDefinitionId
    principalId: traceIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
resource traceRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, traceIdentity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: traceIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource traceBackend 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${traceIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 4318
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: '${registryName}.azurecr.io'
          identity: traceIdentity.id
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
          name: 'tempo'
          image: imageName
          env: [
            {
              name: 'AZURE_STORAGE_ACCOUNT'
              value: storageAccountName
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: traceIdentity.properties.clientId
            }
            {
              name: 'TEMPO_STORAGE_CONTAINER'
              value: traceContainerName
            }
          ]
          resources: {
            cpu: json('0.75')
            memory: '1.5Gi'
          }
        }
        {
          name: 'runtime-trace-canary'
          image: runtimeImage
          command: [
            'node'
          ]
          args: [
            'runtime/trace-export-canary.js'
          ]
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'TRUYN_ENVIRONMENT', value: 'production' }
            { name: 'TRUYN_ROLE', value: 'provider' }
            { name: 'TRUYN_OBSERVABILITY', value: '1' }
            { name: 'TRUYN_METRICS_HOST', value: '127.0.0.1' }
            { name: 'TRUYN_METRICS_PORT', value: '9464' }
            { name: 'OTEL_SERVICE_NAME', value: 'truyn-provider-trace-canary' }
            { name: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', value: 'http://127.0.0.1:4318/v1/traces' }
            { name: 'OTEL_TRACES_SAMPLER', value: 'always_on' }
            { name: 'TRUYN_VERSION', value: sourceSha }
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
  dependsOn: [
    traceContainer
    traceBlobDataContributor
    traceRegistryPull
    blobPrivateDnsZoneGroup
  ]
}

output contract object = {
  schemaVersion: 2
  sourceSha: sourceSha
  backend: 'tempo'
  backendVersion: tempoVersion
  otlpHttp: true
  otlpHttpPort: 4318
  otlpGrpc: true
  otlpGrpcPort: 4317
  storageBackend: 'azure-blob'
  storagePublicNetworkDisabled: true
  managedIdentityRequired: true
  privateEndpointRequired: true
  publicIngress: false
  productionRuntimeTraceExport: true
  traceExportEnvironmentVariable: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'
  requiredProviderSpan: 'truyn.provider.execute'
}

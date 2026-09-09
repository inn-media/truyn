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

@description('Existing production VNet resource ID retained as a compatibility-bound deployment parameter. Blob private DNS linkage is shared and pre-existing.')
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

var probePython = replace(loadTextContent('trace-retention-probe.py'), '__SOURCE_SHA__', sourceSha)
var probeScript = '''
set -eu
python -m pip install --disable-pip-version-check --no-cache-dir --quiet opentelemetry-proto==1.44.0
cat > /tmp/trace-retention-probe.py <<'PY'
${probePython}
PY
python /tmp/trace-retention-probe.py
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

// The Blob private DNS zone and its VNet link are shared production-network
// resources. Tracing consumes the existing zone instead of trying to create a
// second link to the same VNet, which Azure correctly rejects as a conflict.
resource blobPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  name: blobPrivateDnsZoneName
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
            { name: 'TRUYN_TRACE_RETENTION_CLASS', value: 'normal' }
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
  schemaVersion: 4
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
  sharedBlobPrivateDnsRequired: true
  publicIngress: false
  productionRuntimeTraceExport: true
  traceExportEnvironmentVariable: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'
  traceRetentionClassEnvironmentVariable: 'TRUYN_TRACE_RETENTION_CLASS'
  normalTraceRetentionDays: 30
  incidentTraceRetentionDays: 90
  incidentTraceRetentionLonger: true
  requiredProviderSpan: 'truyn.provider.execute'
}

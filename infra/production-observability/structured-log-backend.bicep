targetScope = 'resourceGroup'

@description('Opaque deterministic structured-log backend Container App name.')
param appName string

@description('Opaque deterministic structured-log canary Container App name.')
param canaryAppName string

@description('Opaque deterministic Event Hubs namespace name.')
@minLength(6)
@maxLength(50)
param eventHubNamespaceName string

@description('Opaque deterministic managed identity name.')
param identityName string

@description('Existing internal production Container Apps environment name.')
param environmentName string

@description('Existing internal production Container Apps environment resource ID.')
param environmentId string

@description('Existing production VNet resource ID.')
param vnetId string

@description('Existing production private-endpoint subnet resource ID.')
param privateEndpointSubnetId string

@description('Existing production Azure Container Registry name.')
param registryName string

@description('Exact immutable Vector image built from sourceSha.')
param vectorImage string

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
  'v1.52.0'
])
param victoriaLogsVersion string = 'v1.52.0'

@allowed([
  '0.58.0'
])
param vectorVersion string = '0.58.0'

var eventHubName = 'container-console'
var consumerGroupName = 'truyn-structured-log-forwarder'
var eventHubPrivateDnsZoneName = 'privatelink.servicebus.windows.net'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var tags = {
  component: 'production-structured-log-backend'
  deploymentId: deploymentId
  sourceSha: sourceSha
  managedBy: 'truyn-production-operations-plane'
  backend: 'victorialogs'
  backendVersion: victoriaLogsVersion
  collector: 'vector'
  collectorVersion: vectorVersion
}

var probeScript = '''
set -eu
python - <<'PY'
import json
import time
import urllib.parse
import urllib.request

QUERY_URL = 'http://127.0.0.1:9428/select/logsql/query'
DEPLOYMENT_ID = '${deploymentId}'
QUERY = '_time:45m event:="structured.log.canary" canaryField:="field-value" | fields _time,_msg,timestamp,level,event,service,role,traceId,requestId,needId,resultId,streamProbe,canaryField,platform_stream,environment,deployment,structured'


def query_logs():
    body = urllib.parse.urlencode({'query': QUERY, 'limit': '100'}).encode('utf-8')
    request = urllib.request.Request(
        QUERY_URL,
        data=body,
        method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 200:
            return []
        lines = response.read().decode('utf-8').splitlines()
    rows = []
    for line in lines:
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def valid_row(row, stream):
    required = (
        'timestamp', 'level', 'event', 'service', 'role', 'traceId', 'requestId',
        'needId', 'resultId', 'streamProbe', 'canaryField', 'platform_stream',
        'environment', 'deployment', 'structured',
    )
    if any(row.get(field) in (None, '') for field in required):
        return False
    structured = row.get('structured')
    if structured not in (True, 'true', '1', 1):
        return False
    if row.get('event') != 'structured.log.canary':
        return False
    if row.get('service') != 'truyn-relay' or row.get('role') != 'relay':
        return False
    if row.get('requestId') != 's12-request-01':
        return False
    if row.get('needId') != 's12-need-01' or row.get('resultId') != 's12-result-01':
        return False
    if row.get('streamProbe') != stream or str(row.get('platform_stream')).lower() != stream:
        return False
    if row.get('canaryField') != 'field-value':
        return False
    if row.get('environment') != 'production' or row.get('deployment') != DEPLOYMENT_ID:
        return False
    trace_id = str(row.get('traceId') or '')
    if len(trace_id) != 32 or any(char not in '0123456789abcdef' for char in trace_id):
        return False
    message = str(row.get('_msg') or '')
    if message != 'structured.log.canary':
        return False
    if message.startswith('{') or '"canaryField"' in message or '"requestId"' in message:
        return False
    return True


stdout_ok = False
stderr_ok = False
for _ in range(360):
    try:
        rows = query_logs()
        stdout_ok = any(valid_row(row, 'stdout') for row in rows)
        stderr_ok = any(valid_row(row, 'stderr') for row in rows)
        if stdout_ok and stderr_ok:
            break
    except Exception:
        pass
    time.sleep(5)

if not stdout_ok or not stderr_ok:
    raise SystemExit('structured log field read-back timed out')

print('TRUYN_STRUCTURED_LOG_PASS stdout=1 stderr=1 fields=preserved raw_blob=0 backend=victorialogs', flush=True)
while True:
    time.sleep(3600)
PY
'''

resource logIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource logNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: eventHubNamespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    disableLocalAuth: false
    isAutoInflateEnabled: false
    maximumThroughputUnits: 0
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
  }
}

resource networkRules 'Microsoft.EventHub/namespaces/networkRuleSets@2024-01-01' = {
  parent: logNamespace
  name: 'default'
  properties: {
    defaultAction: 'Deny'
    publicNetworkAccess: 'Enabled'
    trustedServiceAccessEnabled: true
    ipRules: []
    virtualNetworkRules: []
  }
}

resource consoleHub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: logNamespace
  name: eventHubName
  properties: {
    messageRetentionInDays: 1
    partitionCount: 2
    status: 'Active'
  }
}

resource consumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2024-01-01' = {
  parent: consoleHub
  name: consumerGroupName
  properties: {}
}

resource diagnosticsRule 'Microsoft.EventHub/namespaces/authorizationRules@2024-01-01' = {
  parent: logNamespace
  name: 'diagnostics'
  properties: {
    rights: [
      'Manage'
      'Send'
      'Listen'
    ]
  }
}

resource collectorRule 'Microsoft.EventHub/namespaces/eventhubs/authorizationRules@2024-01-01' = {
  parent: consoleHub
  name: 'collector'
  properties: {
    rights: [
      'Listen'
    ]
  }
}

resource eventHubPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: eventHubPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource eventHubPrivateDnsVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: eventHubPrivateDns
  name: guid(logNamespace.id, vnetId)
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

resource eventHubPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${appName}-eventhub-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'namespace'
        properties: {
          privateLinkServiceId: logNamespace.id
          groupIds: [
            'namespace'
          ]
        }
      }
    ]
  }
}

resource eventHubPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: eventHubPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'eventhub'
        properties: {
          privateDnsZoneId: eventHubPrivateDns.id
        }
      }
    ]
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
resource logRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, logIdentity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: logIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: environmentName
}

resource consoleDiagnosticSetting 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'truyn-structured-console-logs'
  scope: managedEnvironment
  properties: {
    eventHubAuthorizationRuleId: diagnosticsRule.id
    eventHubName: consoleHub.name
    logs: [
      {
        category: 'ContainerAppConsoleLogs'
        enabled: true
      }
    ]
  }
  dependsOn: [
    networkRules
  ]
}

resource logBackend 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${logIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 9428
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: '${registryName}.azurecr.io'
          identity: logIdentity.id
        }
      ]
      secrets: [
        {
          name: 'eventhub-connection-string'
          value: listKeys(collectorRule.id, '2024-01-01').primaryConnectionString
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
          name: 'victorialogs'
          image: 'victoriametrics/victoria-logs:${victoriaLogsVersion}'
          args: [
            '-storageDataPath=/victoria-logs-data'
            '-httpListenAddr=:9428'
            '-retentionPeriod=7d'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
        {
          name: 'vector'
          image: vectorImage
          env: [
            {
              name: 'EVENTHUB_BOOTSTRAP'
              value: '${eventHubNamespaceName}.servicebus.windows.net:9093'
            }
            {
              name: 'EVENTHUB_NAME'
              value: eventHubName
            }
            {
              name: 'EVENTHUB_CONNECTION_STRING'
              secretRef: 'eventhub-connection-string'
            }
            {
              name: 'LOG_BACKEND_APP'
              value: appName
            }
            {
              name: 'TRUYN_DEPLOYMENT_ID'
              value: deploymentId
            }
            {
              name: 'VECTOR_DANGEROUSLY_ALLOW_ENV_VAR_INTERPOLATION'
              value: 'true'
            }
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
  dependsOn: [
    consumerGroup
    eventHubPrivateDnsZoneGroup
    logRegistryPull
    consoleDiagnosticSetting
  ]
}

resource logCanary 'Microsoft.App/containerApps@2025-07-01' = {
  name: canaryAppName
  location: location
  tags: union(tags, {
    component: 'production-structured-log-canary'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${logIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: '${registryName}.azurecr.io'
          identity: logIdentity.id
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
          name: 'runtime-log-canary'
          image: runtimeImage
          command: [
            'node'
          ]
          args: [
            'runtime/structured-log-canary.js'
          ]
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'TRUYN_ENVIRONMENT'
              value: 'production'
            }
            {
              name: 'TRUYN_ROLE'
              value: 'relay'
            }
            {
              name: 'TRUYN_DEPLOYMENT_ID'
              value: deploymentId
            }
            {
              name: 'TRUYN_VERSION'
              value: sourceSha
            }
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
    logRegistryPull
    consoleDiagnosticSetting
  ]
}

output contract object = {
  schemaVersion: 1
  sourceSha: sourceSha
  backend: 'victorialogs'
  backendVersion: victoriaLogsVersion
  collector: 'vector'
  collectorVersion: vectorVersion
  sourceCategory: 'ContainerAppConsoleLogs'
  stdout: true
  stderr: true
  ingestTimeJsonParsing: true
  rawJsonBlobAccepted: false
  publicIngress: false
  eventHubTier: 'Standard'
  eventHubFirewallDefaultDeny: true
  trustedMicrosoftServices: true
  collectorPrivateEndpoint: true
  backendFeedbackExcluded: true
  exactMainRuntimeCanary: true
}

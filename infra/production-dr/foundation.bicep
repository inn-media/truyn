targetScope = 'resourceGroup'

@minLength(8)
@maxLength(20)
param namePrefix string

param location string = 'westeurope'
param secondaryLocation string = 'northeurope'

@allowed([
  'Continuous7Days'
  'Continuous30Days'
  'Continuous35Days'
])
param backupTier string = 'Continuous30Days'

@minLength(40)
@maxLength(40)
param sourceSha string

param databaseName string = 'authority'
param containerName string = 'checkpoints'

@minValue(400)
@maxValue(10000)
param throughput int = 400

var tags = {
  'truyn-component': 'production-authority'
  'truyn-managed': 'true'
  'truyn-source-sha': sourceSha
}

var vnetName = '${namePrefix}-vnet'
var managedEnvironmentName = '${namePrefix}-aca-env'
var identityName = '${namePrefix}-authority-mi'
var registryName = toLower('${namePrefix}acr')
var cosmosName = toLower('${namePrefix}cosmos')
var privateEndpointName = '${namePrefix}-cosmos-pe'
var acaSubnetName = 'aca-infrastructure'
var privateEndpointSubnetName = 'private-endpoints'
var cosmosPrivateDnsZoneName = 'privatelink.documents.azure.com'
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.240.0.0/16'
      ]
    }
    subnets: [
      {
        name: acaSubnetName
        properties: {
          addressPrefix: '10.240.0.0/23'
          delegations: [
            {
              name: 'container-apps-environment'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: '10.240.4.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
  dependsOn: [
    cosmos
  ]
}

var acaSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, acaSubnetName)
var privateEndpointSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, privateEndpointSubnetName)

resource authorityIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
  dependsOn: [
    cosmos
  ]
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    dataEndpointEnabled: false
  }
  dependsOn: [
    cosmos
  ]
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: managedEnvironmentName
  location: location
  tags: tags
  properties: {
    publicNetworkAccess: 'Disabled'
    vnetConfiguration: {
      infrastructureSubnetId: acaSubnetId
      internal: true
    }
    zoneRedundant: false
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: cosmosName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
      {
        locationName: secondaryLocation
        failoverPriority: 1
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    enableAutomaticFailover: true
    enableMultipleWriteLocations: false
    disableLocalAuth: true
    publicNetworkAccess: 'Disabled'
    networkAclBypass: 'None'
    isVirtualNetworkFilterEnabled: false
    minimalTlsVersion: 'Tls12'
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: backupTier
      }
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: {
      throughput: throughput
    }
  }
}

resource checkpointContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/partitionKey'
        ]
        kind: 'Hash'
        version: 2
      }
    }
    options: {}
  }
}

resource cosmosPrivateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: cosmosPrivateDnsZoneName
  location: 'global'
  tags: tags
  dependsOn: [
    cosmos
  ]
}

resource cosmosPrivateDnsVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: cosmosPrivateDns
  name: '${namePrefix}-cosmos-dns-link'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource cosmosPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: privateEndpointName
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'cosmos-sql'
        properties: {
          privateLinkServiceId: cosmos.id
          groupIds: [
            'Sql'
          ]
        }
      }
    ]
  }
}

resource cosmosPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: cosmosPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cosmos'
        properties: {
          privateDnsZoneId: cosmosPrivateDns.id
        }
      }
    ]
  }
}

var cosmosDataContributorRoleDefinitionId = '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'

resource cosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: cosmos
  name: guid(cosmos.id, authorityIdentity.id, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: cosmosDataContributorRoleDefinitionId
    principalId: authorityIdentity.properties.principalId
    scope: cosmos.id
  }
}

var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, authorityIdentity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: authorityIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output contract object = {
  schemaVersion: 2
  sourceSha: sourceSha
  primaryRegion: location
  secondaryRegion: secondaryLocation
  backupType: 'Continuous'
  backupTier: backupTier
  regionCount: 2
  automaticFailover: true
  multiWrite: false
  cosmosLocalAuthDisabled: true
  cosmosPublicNetworkDisabled: true
  privateEndpointRequired: true
  containerAppsEnvironmentInternal: true
  managedIdentityRequired: true
  partitionKeyPath: '/partitionKey'
}

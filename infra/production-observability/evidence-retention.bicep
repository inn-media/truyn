targetScope = 'resourceGroup'

@description('Opaque deterministic storage account name for long-lived production acceptance evidence.')
param storageAccountName string

@description('Production region inherited from the accepted production operations plane.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
@minLength(40)
@maxLength(40)
param sourceSha string

@description('Acceptance evidence WORM horizon. Sprint 18 requires at least one year.')
@minValue(365)
param evidenceRetentionDays int = 365

@description('Container for drill, pager and SLO acceptance evidence.')
param evidenceContainerName string = 'acceptance-evidence'

var tags = {
  component: 'production-evidence-retention'
  deploymentId: deploymentId
  sourceSha: sourceSha
  managedBy: 'truyn-production-operations-plane'
  evidenceRetentionDays: string(evidenceRetentionDays)
}

resource evidenceStore 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_GRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: evidenceStore
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: {
      enabled: false
    }
    containerDeleteRetentionPolicy: {
      enabled: false
    }
  }
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: evidenceContainerName
  properties: {
    publicAccess: 'None'
    immutableStorageWithVersioning: {
      enabled: true
    }
    metadata: {
      purpose: 'production-acceptance-evidence'
      classes: 'drill,pager,slo'
      minimumRetentionDays: string(evidenceRetentionDays)
    }
  }
}

output evidenceStorageAccountId string = evidenceStore.id
output evidenceContainerId string = evidenceContainer.id
output evidenceRetentionDays int = evidenceRetentionDays
output immutableStorageWithVersioningEnabled bool = true

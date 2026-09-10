targetScope = 'resourceGroup'

@description('Opaque deterministic evidence vault storage account name.')
param storageAccountName string

@description('Production region inherited from the accepted production foundation.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
@minLength(40)
@maxLength(40)
param sourceSha string

@description('Immutable acceptance evidence retention. Sprint 18 requires at least one year.')
@minValue(365)
param evidenceRetentionDays int = 365

@description('Container reserved for sanitized drill, pager and SLO acceptance evidence.')
param evidenceContainerName string = 'acceptance-evidence'

var tags = {
  component: 'production-evidence-retention'
  deploymentId: deploymentId
  sourceSha: sourceSha
  managedBy: 'truyn-production-operations-plane'
  evidenceRetentionDays: string(evidenceRetentionDays)
}

resource evidenceVault 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: evidenceVault
  name: 'default'
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: evidenceContainerName
  properties: {
    publicAccess: 'None'
    defaultEncryptionScope: '$account-encryption-key'
    denyEncryptionScopeOverride: true
  }
}

output storageAccountId string = evidenceVault.id
output evidenceContainerId string = evidenceContainer.id
output evidenceRetentionDays int = evidenceRetentionDays
output evidenceContainerName string = evidenceContainerName

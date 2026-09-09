targetScope = 'resourceGroup'

@description('Opaque deterministic Log Analytics workspace name.')
param workspaceName string

@description('Opaque deterministic archive storage account name.')
param archiveStorageAccountName string

@description('Production region inherited from the accepted production foundation.')
param location string

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
@minLength(40)
@maxLength(40)
param sourceSha string

@description('Interactive production log retention. Sprint 16 fixes this at 30 days.')
@minValue(30)
@maxValue(30)
param hotRetentionDays int = 30

@description('Archive/audit retention horizon. Must remain at least 90 days.')
@minValue(90)
param archiveRetentionDays int = 180

var tags = {
  component: 'production-logs-retention'
  deploymentId: deploymentId
  sourceSha: sourceSha
  managedBy: 'truyn-production-operations-plane'
  hotRetentionDays: string(hotRetentionDays)
  archiveRetentionDays: string(archiveRetentionDays)
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: hotRetentionDays
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource archive 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: archiveStorageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
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

resource archiveLifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: archive
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'retain-production-observability-logs'
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: archiveRetentionDays
                }
              }
            }
            filters: {
              blobTypes: [
                'blockBlob'
                'appendBlob'
              ]
            }
          }
        }
      ]
    }
  }
}

output workspaceId string = workspace.id
output archiveStorageAccountId string = archive.id
output hotRetentionDays int = hotRetentionDays
output archiveRetentionDays int = archiveRetentionDays

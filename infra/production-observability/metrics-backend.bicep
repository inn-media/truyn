@description('Opaque deterministic Azure Monitor workspace name supplied by deployment workflow.')
param workspaceName string

@description('Production metrics data-residency region.')
param location string = 'germanywestcentral'

@description('Opaque production deployment identity.')
param deploymentId string

@description('Exact Git source SHA performing the deployment.')
param sourceSha string

resource workspace 'Microsoft.Monitor/accounts@2023-04-03' = {
  name: workspaceName
  location: location
  tags: {
    component: 'production-metrics-backend'
    deploymentId: deploymentId
    sourceSha: sourceSha
    managedBy: 'truyn-production-operations-plane'
  }
}

output workspaceId string = workspace.id

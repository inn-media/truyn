import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../.github/workflows/g5-azure-readonly-inventory.yml',import.meta.url),'utf8');

test('G5 Azure inventory requires exact main and read-only OIDC',()=>{
  for(const required of [
    "paths: ['.github/workflows/g5-azure-readonly-inventory.yml']",
    "github.ref == 'refs/heads/main'",
    'id-token: write',
    'persist-credentials: false',
    'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
    'node --test tests/g5-azure-inventory-workflow.test.js',
    'azure/login@v2',
    'az group show',
    'az cosmosdb list',
    'az cosmosdb sql database list',
    'az cosmosdb sql container list',
    'az containerapp list',
    'partitionKeyCompatibleContainers',
    'BLOCKED_NOT_LIVE_QUALIFIED',
    'upstreamCalls:0,mainnetAdmissionPermitted:false',
    'productionMutationsPerformed:false',
  ]) assert.ok(source.includes(required),'missing G5 read-only invariant: '+required);
  const section=source.split('      - name: Read resource metadata without provisioning or invoking providers')[1] || '';
  assert.ok(section,'cloud query section required');
  assert.doesNotMatch(section, /\baz\s+(?:group|cosmosdb|containerapp|vm|deployment|resource)\s+(?:create|update|delete|patch|apply|set|start|stop|restart|up)\b/i);
  assert.doesNotMatch(section, /\baz\s+rest\b/i);
  assert.doesNotMatch(section, /(?:curl|wget|Invoke-WebRequest).*?(?:-X|--request)\s+(?:POST|PUT|PATCH|DELETE)/i);
});

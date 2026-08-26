import json
import os

from truyn import TruynLocalNodeClient

relay_url = os.environ.get('TRUYN_RELAY_URL') or os.environ.get('TRUYN_E2E_RELAY_URL')
if not relay_url:
    raise SystemExit('Set TRUYN_RELAY_URL, for example http://127.0.0.1:8787')

provider = TruynLocalNodeClient.connect(relay_url, name='hello-provider')
requester = TruynLocalNodeClient.connect(relay_url, name='hello-requester')

try:
    provider.offer('sdk.echo', {'example': 'hello-need-result'})

    receipt = requester.need(
        'sdk.echo',
        {'text': 'hello TRUYN'},
        {'purpose': 'sdk-quickstart'},
    )

    need = provider.next_need(timeout_ms=2000)
    output = {'text': 'RESULT: ' + need['input']['text']}

    provider.result(need['needId'], output, {'example': 'hello-need-result'})

    result = requester.wait_for_result(receipt['needId'], timeout_ms=2000)
    print(json.dumps({'ok': result['verification']['ok'], 'output': result['output']}, indent=2))
finally:
    requester.close()
    provider.close()

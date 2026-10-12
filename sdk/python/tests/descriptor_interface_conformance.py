import json
import os
from pathlib import Path
from truyn.client import TruynClient
suite = json.loads(Path(os.environ['TRUYN_DESCRIPTOR_CASES_FILE']).read_text())
client = TruynClient(suite['baseUrl'])
rows = []
for item in suite['cases']:
    try:
        value = client.fetch_agent_descriptor(item['url'], public_key_pem=suite['publicKeyPem'])
        rows.append(dict(id=item['id'], ok=True, identity=value['descriptor']['identity'],
            protocol=value['selection']['protocol'], interface=value['selection']['interface'], keyBinding=value['signer']['keyBinding']))
    except Exception as error:
        rows.append(dict(id=item['id'], ok=False, message=str(error)))
Path(os.environ['TRUYN_DESCRIPTOR_RESULT_FILE']).write_text(json.dumps(rows))

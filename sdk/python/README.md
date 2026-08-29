# truyn-sdk

First-party Python SDK for TRUYN.

```python
from truyn import TruynLocalNodeClient

client = TruynLocalNodeClient.connect("https://relay.example")
receipt = client.need("reasoning.general", {"question": "Hello"})
result = client.wait_for_result(receipt["needId"])
```

This is a pre-stable `0.x` SDK. `TRUYN/1` remains draft.

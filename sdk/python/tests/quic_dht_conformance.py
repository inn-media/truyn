"""Live native aioquic five-method DHT conformance against TRUYN/1 UDP server."""
from __future__ import annotations

import asyncio
import copy
import sys

from truyn.quic_dht import connect_quic_dht, _record


async def check(host: str, port: int, ca: str, peer_id: str) -> None:
    async with connect_quic_dht(host, port, ca_file=ca, expected_node_id=peer_id) as client:
        assert await client.ping()
        discovered = await client.find_node(peer_id)
        assert any(p['nodeId'] == peer_id for p in discovered)
        announcement = await client.announce(['quic://127.0.0.1:4433'])
        assert announcement['accepted'] and announcement['nodeId'] == client.node_id
        receipt = await client.store('python-quic', 'five-dht-methods', {'model': 'python-native', 'count': 5})
        assert receipt['stored'] is True
        values = await client.find_value('python-quic', 'five-dht-methods')
        assert any(value['recordId'] == receipt['recordId'] for value in values)
        corrupted = copy.deepcopy(values[0])
        corrupted['value'] = {'model': 'tampered'}
        try:
            _record(corrupted, peer=False)
            raise AssertionError('tampered signed DHT record accepted')
        except ValueError:
            pass
    # A valid TLS peer with wrong signed Node ID must not authenticate.
    try:
        async with connect_quic_dht(host, port, ca_file=ca,
                                    expected_node_id='truyn:node:' + '0' * 64):
            raise AssertionError('foreign signed QUIC identity accepted')
    except ValueError as error:
        assert 'unexpected_peer' in str(error)
    print('TRUYN_NATIVE_PYTHON_QUIC_DHT_PASS five_methods=5 signed_record=PASS wrong_peer=DENY')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('host port ca_cert expected_node_id required')
    asyncio.run(check(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]))

import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from truyn.local_node import verify_envelope, unsigned_envelope, create_envelope, create_local_identity
from truyn.descriptor import canonicalize
results = {}
for case in json.load(open('sdk/conformance/v1/protocol-envelope-golden-fixtures.json'))['cases']:
    result = verify_envelope(case['envelope'])
    result['canonicalUnsignedSha256'] = hashlib.sha256(canonicalize(unsigned_envelope(case['envelope'])).encode('utf-8')).hexdigest()
    results[case['id']] = result
for case in json.load(open('sdk/conformance/v1/envelope-ext-fixtures.json'))['cases']:
    results[case['id']] = verify_envelope(case['envelope'], negotiated_semantics=case['negotiatedSemantics'], now=case['now'])
args=dict(type='NEED',identity=create_local_identity(),payload={'input':{'query':'Bakı 🚀','topK':42,'threshold':0.5}},ext={'priority':'normal'})
blocked=False
try: create_envelope(**args)
except ValueError: blocked=True
emitted=create_envelope(**args,negotiated_semantics=['truyn.envelope.ext/1'])
print('WIRE_FREEZE_RESULT ' + json.dumps({'language':'python','results':results,'emitted':emitted,'emissionBlocked':blocked}))

import unittest
from truyn.descriptor import canonicalize

class TestTCJ1WireFreeze(unittest.TestCase):
    def test_known_vectors(self):
        cases = [
            ({"q":"R&D <b>"}, '{"q":"R&D <b>"}'),
            ({"q":"🚀"}, '{"q":"🚀"}'),
            ({"n":1.0}, '{"n":1}'),
            ({"n":1e-7}, '{"n":1e-7}'),
            ({"n":1e21}, '{"n":1e+21}'),
            ({"n":0.000025}, '{"n":0.000025}'),
            ({"n":-0.0}, '{"n":0}'),
            ({"q":"a\u2028b\u2029c"}, '{"q":"a\u2028b\u2029c"}'),
            ({"\uffff":1, "😀":2}, '{"😀":2,"\uffff":1}'),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(canonicalize(value).encode('utf-8'), expected.encode('utf-8'))
    def test_shared_corpus(self):
        import json
        from pathlib import Path
        file = Path(__file__).resolve().parents[2] / 'conformance' / 'v1' / 'tcj1-wire-freeze-vectors.json'
        corpus = json.loads(file.read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(corpus['cases']), 14)
        for case in corpus['cases']:
            with self.subTest(vector=case['id']):
                self.assertEqual(canonicalize(case['input']).encode('utf-8'), case['canonicalUnsigned'].encode('utf-8'))

    def test_unsupported_exact_integer(self):
        with self.assertRaises(ValueError):
            canonicalize({"n":2**60})
if __name__ == "__main__": unittest.main()

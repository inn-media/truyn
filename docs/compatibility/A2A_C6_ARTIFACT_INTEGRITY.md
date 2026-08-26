# A2A C6 Artifact Integrity

**Status:** bounded implementation candidate.

C6 adds integrity-preserving A2A artifact mapping without changing TRUYN wire semantics.

The accepted bounded contract is:

- text, canonical JSON and raw file Parts carry SHA-256 and byte-size integrity metadata;
- canonical base64 is required for raw inline bytes;
- digest, size and encoding mismatches fail closed;
- artifact size is bounded before a remote artifact can become a successful TRUYN RESULT;
- URL Parts are never fetched implicitly: an operator-supplied resolver must materialize bytes before inbound URL content is accepted;
- outbound URL references require verified integrity metadata;
- provider-supplied provenance cannot replace authoritative TRUYN provenance;
- corrupt or unverified artifact output does not become a successful A2A Task/Artifact result.

Primary executable evidence is `tests/a2a-artifact-integrity.test.js`.

C6 does not claim the C8 cross-protocol adversarial matrix, streaming chunk reassembly, push lifecycle or stable protocol compatibility.

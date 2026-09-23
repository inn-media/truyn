# NLWeb bridge

Bounded pinned NLWeb 0.5 interoperability profile (WHO discovery → ASK composition through canonical TRUYN authority/dispatch).

| Module | Role |
|---|---|
| `client.js` | NLWeb protocol version + client |
| `who.js` | authorization-aware semantic WHO discovery |
| `ask.js` | WHO → ASK composition |
| `response.js` | response/correlation/provenance shaping |
| `provider-edge.js` | provider edge binding |
| `bridge-matrix.js` | explicitly tested bridge mappings |

Architecture and evidence: [`docs/architecture/NLWEB_INTEROPERABILITY.md`](../../docs/architecture/NLWEB_INTEROPERABILITY.md).

This directory must contain only NLWeb bridge modules; other adapters live in their own `adapters/<name>/` directories.
